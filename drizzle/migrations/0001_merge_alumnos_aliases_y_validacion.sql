CREATE OR REPLACE FUNCTION public.merge_alumnos(_principal_id uuid, _duplicado_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r record;
  rid record;
  moved bigint;
  ok bigint;
  conflictivos bigint;
  total_moved bigint := 0;
  total_conf bigint := 0;
  detalle jsonb := '[]'::jsonb;
  conflictos jsonb := '[]'::jsonb;
  p public.alumnos%ROWTYPE;
  d public.alumnos%ROWTYPE;
  nuevos_emails text[];
  nuevos_bancos text[];
  v_user_id uuid;
  v_placeholder text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _principal_id = _duplicado_id THEN
    RAISE EXCEPTION 'La ficha principal y la duplicada deben ser distintas';
  END IF;

  SELECT * INTO p FROM public.alumnos WHERE id = _principal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha principal inexistente'; END IF;
  SELECT * INTO d FROM public.alumnos WHERE id = _duplicado_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha duplicada inexistente'; END IF;

  IF p.fusionada_en IS NOT NULL OR p.estado = 'fusionada' THEN
    RAISE EXCEPTION 'La ficha principal ya fue fusionada en otra ficha';
  END IF;
  IF d.fusionada_en IS NOT NULL OR d.estado = 'fusionada' THEN
    RAISE EXCEPTION 'La ficha duplicada ya fue fusionada';
  END IF;

  -- Identidad Auth canónica: preferir la asociada al email principal de la principal
  IF p.user_id IS NULL THEN
    v_user_id := d.user_id;
  ELSIF d.user_id IS NULL OR p.user_id = d.user_id THEN
    v_user_id := p.user_id;
  ELSE
    SELECT u.id INTO v_user_id FROM auth.users u
     WHERE u.id IN (p.user_id, d.user_id)
       AND lower(btrim(coalesce(u.email,''))) = lower(btrim(coalesce(p.email,'')))
     LIMIT 1;
    IF v_user_id IS NULL THEN
      SELECT u.id INTO v_user_id FROM auth.users u
       WHERE u.id IN (p.user_id, d.user_id)
       ORDER BY u.last_sign_in_at DESC NULLS LAST, u.created_at DESC LIMIT 1;
    END IF;
    v_user_id := COALESCE(v_user_id, p.user_id, d.user_id);
  END IF;

  -- Mover FKs sin borrar nada: los conflictivos quedan intactos y se reportan
  FOR r IN
    SELECT DISTINCT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.alumnos'::regclass
       AND c.conrelid <> 'public.alumnos'::regclass
     ORDER BY 1, 2
  LOOP
    BEGIN
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col)
        USING _principal_id, _duplicado_id;
      GET DIAGNOSTICS moved = ROW_COUNT;
      IF moved > 0 THEN
        total_moved := total_moved + moved;
        detalle := detalle || jsonb_build_object('tabla', r.tbl, 'columna', r.col, 'movidos', moved);
      END IF;
    EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
      ok := 0; conflictivos := 0;
      FOR rid IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tbl, r.col) USING _duplicado_id
      LOOP
        BEGIN
          EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col)
            USING _principal_id, rid.ctid;
          ok := ok + 1;
        EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
          conflictivos := conflictivos + 1; -- se deja intacto, sin borrar
        END;
      END LOOP;
      total_moved := total_moved + ok;
      total_conf := total_conf + conflictivos;
      detalle := detalle || jsonb_build_object('tabla', r.tbl, 'columna', r.col, 'movidos', ok, 'conflictivos', conflictivos);
      IF conflictivos > 0 THEN
        conflictos := conflictos || jsonb_build_object('tipo', 'fk_conflicto', 'tabla', r.tbl, 'columna', r.col, 'registros', conflictivos);
      END IF;
    END;
  END LOOP;

  -- Emails: unión sin duplicados
  nuevos_emails := COALESCE(p.emails_adicionales, ARRAY[]::text[]);
  IF d.email IS NOT NULL AND btrim(d.email) <> '' AND d.email NOT ILIKE '%@reybaud.invalid'
     AND lower(btrim(d.email)) <> lower(btrim(COALESCE(p.email, '')))
     AND NOT (lower(btrim(d.email)) = ANY (SELECT lower(btrim(x)) FROM unnest(nuevos_emails) x)) THEN
    nuevos_emails := nuevos_emails || d.email;
  END IF;
  IF d.emails_adicionales IS NOT NULL THEN
    nuevos_emails := nuevos_emails || (
      SELECT COALESCE(array_agg(e), ARRAY[]::text[]) FROM unnest(d.emails_adicionales) e
       WHERE btrim(e) <> '' AND e NOT ILIKE '%@reybaud.invalid'
         AND lower(btrim(e)) <> lower(btrim(COALESCE(p.email, '')))
         AND NOT (lower(btrim(e)) = ANY (SELECT lower(btrim(x)) FROM unnest(nuevos_emails) x))
    );
  END IF;

  nuevos_bancos := COALESCE(p.nombres_bancarios, ARRAY[]::text[]);
  IF d.nombres_bancarios IS NOT NULL THEN
    nuevos_bancos := nuevos_bancos || (
      SELECT COALESCE(array_agg(b), ARRAY[]::text[]) FROM unnest(d.nombres_bancarios) b
       WHERE btrim(b) <> ''
         AND NOT (lower(btrim(b)) = ANY (SELECT lower(btrim(x)) FROM unnest(nuevos_bancos) x))
    );
  END IF;

  -- Conflictos de campos no vacíos y distintos (no se pisan)
  SELECT conflictos || COALESCE(jsonb_agg(jsonb_build_object('tipo','campo','campo',campo,'principal',vp,'duplicada',vd)), '[]'::jsonb)
    INTO conflictos
    FROM (
      VALUES
        ('telefono', p.telefono, d.telefono),
        ('documento', p.documento, d.documento),
        ('direccion', p.direccion, d.direccion),
        ('ciudad', p.ciudad, d.ciudad),
        ('provincia', p.provincia, d.provincia),
        ('fecha_nacimiento', p.fecha_nacimiento::text, d.fecha_nacimiento::text),
        ('contacto_emergencia_nombre', p.contacto_emergencia_nombre, d.contacto_emergencia_nombre),
        ('contacto_emergencia_telefono', p.contacto_emergencia_telefono, d.contacto_emergencia_telefono),
        ('contacto_emergencia_relacion', p.contacto_emergencia_relacion, d.contacto_emergencia_relacion),
        ('obra_social_nombre', p.obra_social_nombre, d.obra_social_nombre),
        ('obra_social_numero_socio', p.obra_social_numero_socio, d.obra_social_numero_socio),
        ('obra_social_plan', p.obra_social_plan, d.obra_social_plan),
        ('nombre_fiscal', p.nombre_fiscal, d.nombre_fiscal),
        ('domicilio_fiscal', p.domicilio_fiscal, d.domicilio_fiscal),
        ('medical_certificate_url', p.medical_certificate_url, d.medical_certificate_url),
        ('fecha_ingreso_escuela', p.fecha_ingreso_escuela::text, d.fecha_ingreso_escuela::text)
    ) AS t(campo, vp, vd)
   WHERE COALESCE(btrim(vp), '') <> '' AND COALESCE(btrim(vd), '') <> '' AND btrim(vp) <> btrim(vd);

  -- Completar campos vacíos de la principal con los de la duplicada
  UPDATE public.alumnos SET
      emails_adicionales = nuevos_emails,
      nombres_bancarios = nuevos_bancos,
      user_id = v_user_id,
      telefono = COALESCE(NULLIF(btrim(p.telefono), ''), d.telefono),
      documento = COALESCE(NULLIF(btrim(p.documento), ''), d.documento),
      direccion = COALESCE(NULLIF(btrim(p.direccion), ''), d.direccion),
      ciudad = COALESCE(NULLIF(btrim(p.ciudad), ''), d.ciudad),
      provincia = COALESCE(NULLIF(btrim(p.provincia), ''), d.provincia),
      fecha_nacimiento = COALESCE(p.fecha_nacimiento, d.fecha_nacimiento),
      contacto_emergencia_nombre = COALESCE(NULLIF(btrim(p.contacto_emergencia_nombre), ''), d.contacto_emergencia_nombre),
      contacto_emergencia_telefono = COALESCE(NULLIF(btrim(p.contacto_emergencia_telefono), ''), d.contacto_emergencia_telefono),
      contacto_emergencia_relacion = COALESCE(NULLIF(btrim(p.contacto_emergencia_relacion), ''), d.contacto_emergencia_relacion),
      contacto_emergencia_nombre_2 = COALESCE(NULLIF(btrim(p.contacto_emergencia_nombre_2), ''), d.contacto_emergencia_nombre_2),
      contacto_emergencia_telefono_2 = COALESCE(NULLIF(btrim(p.contacto_emergencia_telefono_2), ''), d.contacto_emergencia_telefono_2),
      contacto_emergencia_relacion_2 = COALESCE(NULLIF(btrim(p.contacto_emergencia_relacion_2), ''), d.contacto_emergencia_relacion_2),
      obra_social_nombre = COALESCE(NULLIF(btrim(p.obra_social_nombre), ''), d.obra_social_nombre),
      obra_social_numero_socio = COALESCE(NULLIF(btrim(p.obra_social_numero_socio), ''), d.obra_social_numero_socio),
      obra_social_plan = COALESCE(NULLIF(btrim(p.obra_social_plan), ''), d.obra_social_plan),
      nombre_fiscal = COALESCE(NULLIF(btrim(p.nombre_fiscal), ''), d.nombre_fiscal),
      domicilio_fiscal = COALESCE(NULLIF(btrim(p.domicilio_fiscal), ''), d.domicilio_fiscal),
      condicion_medica = COALESCE(NULLIF(btrim(p.condicion_medica), ''), d.condicion_medica),
      medical_certificate_url = COALESCE(NULLIF(btrim(p.medical_certificate_url), ''), d.medical_certificate_url),
      medical_certificate_uploaded_at = COALESCE(p.medical_certificate_uploaded_at, d.medical_certificate_uploaded_at),
      medical_certificate_expiration_date = COALESCE(p.medical_certificate_expiration_date, d.medical_certificate_expiration_date),
      medical_certificate_signature_date = COALESCE(p.medical_certificate_signature_date, d.medical_certificate_signature_date),
      fecha_ingreso_escuela = LEAST(COALESCE(p.fecha_ingreso_escuela, d.fecha_ingreso_escuela), COALESCE(d.fecha_ingreso_escuela, p.fecha_ingreso_escuela))
   WHERE id = _principal_id;

  UPDATE public.marketing_contacts
     SET alumno_id = _principal_id,
         es_email_secundario = CASE WHEN lower(btrim(email)) = lower(btrim(COALESCE(p.email, ''))) THEN false ELSE true END
   WHERE alumno_id = _duplicado_id OR lower(btrim(email)) = lower(btrim(COALESCE(d.email, '')));

  -- Aliases de identidad Auth de ambas fichas → principal
  INSERT INTO public.alumno_auth_aliases (alumno_id, user_id, email, is_primary)
  VALUES (_principal_id, v_user_id, NULLIF(btrim(COALESCE(p.email,'')), ''), true)
  ON CONFLICT DO NOTHING;

  IF p.user_id IS NOT NULL THEN
    INSERT INTO public.alumno_auth_aliases (alumno_id, user_id, is_primary)
    VALUES (_principal_id, p.user_id, p.user_id = v_user_id) ON CONFLICT DO NOTHING;
  END IF;
  IF d.user_id IS NOT NULL THEN
    INSERT INTO public.alumno_auth_aliases (alumno_id, user_id, is_primary)
    VALUES (_principal_id, d.user_id, d.user_id = v_user_id) ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.alumno_auth_aliases (alumno_id, email, is_primary)
  SELECT _principal_id, e, false
    FROM unnest(nuevos_emails) e
   WHERE btrim(e) <> '' AND e NOT ILIKE '%@reybaud.invalid'
  ON CONFLICT DO NOTHING;

  IF d.email IS NOT NULL AND btrim(d.email) <> '' AND d.email NOT ILIKE '%@reybaud.invalid' THEN
    INSERT INTO public.alumno_auth_aliases (alumno_id, email, is_primary)
    VALUES (_principal_id, d.email, false) ON CONFLICT DO NOTHING;
    UPDATE public.alumno_auth_aliases
       SET alumno_id = _principal_id, active = true
     WHERE lower(btrim(email)) = lower(btrim(d.email));
  END IF;

  -- Ficha duplicada: inactiva, sin identidad Auth, email liberado con placeholder
  v_placeholder := 'fusionada+' || _duplicado_id::text || '@reybaud.invalid';
  UPDATE public.alumnos
     SET estado = 'inactivo',
         fusionada_en = _principal_id,
         fusionada_at = now(),
         user_id = NULL,
         email = v_placeholder,
         emails_adicionales = ARRAY[]::text[]
   WHERE id = _duplicado_id;

  BEGIN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, details)
    VALUES (auth.uid(), 'merge_alumnos', 'alumnos', _duplicado_id,
            jsonb_build_object('principal_id', _principal_id, 'duplicado_id', _duplicado_id,
                               'movidos', total_moved, 'conflictivos', total_conf,
                               'detalle', detalle, 'conflictos', conflictos,
                               'email_duplicada_original', d.email,
                               'user_id_conservado', v_user_id));
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'principal_id', _principal_id, 'duplicado_id', _duplicado_id,
                            'movidos', total_moved, 'conflictivos', total_conf, 'detalle', detalle,
                            'conflictos', conflictos, 'emails_finales', nuevos_emails,
                            'user_id_conservado', v_user_id,
                            'validacion', public.validate_merge_alumnos(_principal_id));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.validate_merge_alumnos(_principal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_activas int;
  v_emails_ok boolean;
  v_uids_ok boolean;
  v_emails text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT count(*) INTO v_activas
    FROM public.alumnos a
   WHERE (a.id = _principal_id OR a.fusionada_en = _principal_id)
     AND a.fusionada_en IS NULL AND a.estado <> 'fusionada';

  SELECT COALESCE(array_agg(DISTINCT lower(btrim(e))), ARRAY[]::text[]) INTO v_emails
    FROM (
      SELECT a.email AS e FROM public.alumnos a WHERE a.id = _principal_id
      UNION ALL
      SELECT unnest(coalesce(a.emails_adicionales, ARRAY[]::text[])) FROM public.alumnos a WHERE a.id = _principal_id
      UNION ALL
      SELECT al.email FROM public.alumno_auth_aliases al WHERE al.alumno_id = _principal_id AND al.active
    ) s
   WHERE e IS NOT NULL AND btrim(e) <> '' AND e NOT ILIKE '%@reybaud.invalid';

  SELECT bool_and(x.id = _principal_id) INTO v_emails_ok
    FROM unnest(v_emails) em, LATERAL public.lookup_alumno_by_email(em) x;

  SELECT bool_and(al.alumno_id = _principal_id) INTO v_uids_ok
    FROM public.alumno_auth_aliases al
   WHERE al.active AND al.user_id IS NOT NULL
     AND al.user_id IN (SELECT user_id FROM public.alumno_auth_aliases WHERE alumno_id = _principal_id AND user_id IS NOT NULL);

  RETURN jsonb_build_object(
    'fichas_activas', v_activas,
    'una_sola_ficha_activa', v_activas = 1,
    'emails', v_emails,
    'todos_los_emails_resuelven_a_principal', COALESCE(v_emails_ok, true),
    'todos_los_user_ids_resuelven_a_principal', COALESCE(v_uids_ok, true)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.validate_merge_alumnos(uuid) TO authenticated, service_role;
