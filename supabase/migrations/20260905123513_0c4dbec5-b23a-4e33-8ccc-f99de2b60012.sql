CREATE OR REPLACE FUNCTION public.merge_alumnos(_principal_id uuid, _duplicado_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  rid record;
  moved bigint;
  ok bigint;
  skipped bigint;
  total_moved bigint := 0;
  total_desc bigint := 0;
  detalle jsonb := '[]'::jsonb;
  p public.alumnos%ROWTYPE;
  d public.alumnos%ROWTYPE;
  nuevos_emails text[];
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
    EXCEPTION
      WHEN unique_violation OR check_violation THEN
        ok := 0; skipped := 0;
        FOR rid IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tbl, r.col) USING _duplicado_id
        LOOP
          BEGIN
            EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col)
              USING _principal_id, rid.ctid;
            ok := ok + 1;
          EXCEPTION WHEN unique_violation OR check_violation THEN
            EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tbl) USING rid.ctid;
            skipped := skipped + 1;
          END;
        END LOOP;
        total_moved := total_moved + ok;
        total_desc := total_desc + skipped;
        detalle := detalle || jsonb_build_object('tabla', r.tbl, 'columna', r.col, 'movidos', ok, 'descartados', skipped);
    END;
  END LOOP;

  nuevos_emails := COALESCE(p.emails_adicionales, ARRAY[]::text[]);
  IF d.email IS NOT NULL AND d.email <> ''
     AND lower(d.email) <> lower(COALESCE(p.email, ''))
     AND NOT (lower(d.email) = ANY (SELECT lower(x) FROM unnest(nuevos_emails) x)) THEN
    nuevos_emails := nuevos_emails || d.email;
  END IF;
  IF d.emails_adicionales IS NOT NULL THEN
    nuevos_emails := nuevos_emails || (
      SELECT COALESCE(array_agg(e), ARRAY[]::text[])
      FROM unnest(d.emails_adicionales) e
      WHERE lower(e) <> lower(COALESCE(p.email, ''))
        AND NOT (lower(e) = ANY (SELECT lower(x) FROM unnest(nuevos_emails) x))
    );
  END IF;

  UPDATE public.alumnos
     SET emails_adicionales = nuevos_emails,
         user_id = COALESCE(p.user_id, d.user_id),
         telefono = COALESCE(NULLIF(p.telefono, ''), d.telefono),
         documento = COALESCE(NULLIF(p.documento, ''), d.documento)
   WHERE id = _principal_id;

  UPDATE public.marketing_contacts
     SET alumno_id = _principal_id,
         es_email_secundario = CASE WHEN lower(email) = lower(COALESCE(p.email, '')) THEN false ELSE true END
   WHERE alumno_id = _duplicado_id
      OR lower(email) = lower(COALESCE(d.email, ''));

  UPDATE public.alumnos
     SET estado = 'inactivo',
         fusionada_en = _principal_id,
         fusionada_at = now(),
         user_id = NULL,
         emails_adicionales = ARRAY[]::text[]
   WHERE id = _duplicado_id;

  BEGIN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, details)
    VALUES (auth.uid(), 'merge_alumnos', 'alumnos', _duplicado_id,
            jsonb_build_object('principal_id', _principal_id, 'duplicado_id', _duplicado_id,
                               'movidos', total_moved, 'descartados', total_desc, 'detalle', detalle));
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'principal_id', _principal_id, 'duplicado_id', _duplicado_id,
                            'movidos', total_moved, 'descartados', total_desc, 'detalle', detalle,
                            'emails_finales', nuevos_emails);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_alumnos(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merge_alumnos(uuid, uuid) TO authenticated, service_role;