-- ============================================================
-- Programas: bajas con conservación de saldo + identidad única
-- ============================================================

-- ---------- 0. Guard de autorización reutilizable ----------
CREATE OR REPLACE FUNCTION public._programa_admin_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(current_setting('app.programa_test', true), '') = 'on'
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid());
$$;

-- ---------- 1. Normalizadores de identidad ----------
CREATE OR REPLACE FUNCTION public.normalizar_telefono_ar(_t text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE d text; area int;
BEGIN
  IF _t IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(_t, '\D', '', 'g');
  IF length(d) < 8 THEN RETURN NULL; END IF;
  IF left(d,2) = '00' THEN d := substr(d,3); END IF;
  IF left(d,3) = '549' THEN d := substr(d,4);
  ELSIF left(d,2) = '54' THEN d := substr(d,3); END IF;
  WHILE left(d,1) = '0' LOOP d := substr(d,2); END LOOP;
  IF length(d) > 10 THEN
    FOREACH area IN ARRAY ARRAY[2,3,4] LOOP
      IF length(d) - area >= 8 AND substr(d, area+1, 2) = '15'
         AND length(left(d,area) || substr(d, area+3)) = 10 THEN
        d := left(d,area) || substr(d, area+3);
        EXIT;
      END IF;
    END LOOP;
  END IF;
  IF length(d) < 10 OR length(d) > 11 THEN RETURN NULL; END IF;
  RETURN '549' || right(d, 10);
END; $$;

CREATE OR REPLACE FUNCTION public.normalizar_nombre(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(translate(COALESCE(_t,''),
        'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
      '\s+', ' ', 'g'),
    '')
$$;

-- ---------- 2. Saldo disponible de pagos reales ----------
-- Un pago "consumido legacy" es aquel cuyo importe ya aparece como HABER en la
-- cuenta corriente por estar atado a una suscripción vigente. No debe volver a
-- contarse como disponible.
CREATE OR REPLACE FUNCTION public.pago_consumido_legacy(_tipo text, _id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE _tipo
    WHEN 'mp_movement' THEN EXISTS (
      SELECT 1 FROM public.mp_account_movements mp
      JOIN public.suscripciones s ON s.id = mp.suscripcion_id
      WHERE mp.id = _id
        AND s.cancelada_at IS NULL
        AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
        AND public.is_subscription_paid(s.id)
    )
    ELSE false
  END;
$$;

DROP VIEW IF EXISTS public.vw_pagos_disponibles;
CREATE VIEW public.vw_pagos_disponibles AS
SELECT
  mp.alumno_id,
  'mp_movement'::text                       AS pago_origen_tipo,
  mp.id                                     AS pago_origen_id,
  mp.mp_payment_id,
  mp.fecha_movimiento                       AS fecha,
  COALESCE(mp.description, 'Mercado Pago')  AS concepto,
  mp.currency                               AS moneda,
  mp.amount                                 AS monto_bruto,
  public.pago_monto_imputado('mp_movement', mp.id)  AS monto_imputado,
  public.pago_consumido_legacy('mp_movement', mp.id) AS consumido_legacy,
  CASE WHEN public.pago_consumido_legacy('mp_movement', mp.id) THEN 0::numeric
       ELSE GREATEST(0, mp.amount - public.pago_monto_imputado('mp_movement', mp.id))
  END                                       AS disponible
FROM public.mp_account_movements mp
WHERE mp.alumno_id IS NOT NULL
  AND mp.direccion = 'ingreso'
  AND mp.status = 'approved';

GRANT SELECT ON public.vw_pagos_disponibles TO authenticated;
GRANT SELECT ON public.vw_pagos_disponibles TO service_role;

-- ---------- 3. La cuenta corriente reconoce las imputaciones ----------
DO $mig$
DECLARE v_def text;
BEGIN
  SELECT pg_get_viewdef('public.vw_cuenta_corriente_movimientos', true) INTO v_def;
  IF v_def NOT ILIKE '%pagos_imputaciones%' THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS '
      || rtrim(btrim(v_def), ';')
      || $q$
      UNION ALL
      SELECT pi.alumno_id,
             pi.created_at::date AS fecha,
             'pago_imputacion'::text AS tipo,
             'Aplicación de saldo disponible'::text AS concepto,
             'pagos_imputaciones'::text AS fuente_tabla,
             pi.id AS fuente_id,
             0::numeric AS debe,
             pi.monto AS haber,
             pi.moneda,
             'imputado'::text AS estado,
             jsonb_build_object(
               'pago_origen_tipo', pi.pago_origen_tipo,
               'pago_origen_id', pi.pago_origen_id,
               'obligacion_tipo', pi.obligacion_tipo,
               'obligacion_id', pi.obligacion_id,
               'metadata', pi.metadata) AS referencia_extra
      FROM public.pagos_imputaciones pi
      WHERE pi.anulado_at IS NULL
        AND NOT public.pago_consumido_legacy(pi.pago_origen_tipo, pi.pago_origen_id)
      $q$;
  END IF;
END $mig$;

-- ---------- 4. Baja canónica de un programa ----------
CREATE OR REPLACE FUNCTION public.dar_de_baja_programa(
  _suscripcion_id uuid,
  _motivo text,
  _tratamiento_pago text DEFAULT 'conservar_como_disponible'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s public.suscripciones;
  p public.planes;
  v_pagado numeric := 0;
  v_mp_real boolean;
  v_credito_real boolean;
  v_ficticio boolean := false;
  v_anuladas int := 0;
  v_mov record;
  v_disponible numeric := 0;
BEGIN
  IF NOT public._programa_admin_ok() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _tratamiento_pago NOT IN ('conservar_como_disponible','reembolso_externo','sin_pago') THEN
    RAISE EXCEPTION 'tratamiento_pago inválido: %', _tratamiento_pago;
  END IF;

  SELECT * INTO s FROM public.suscripciones WHERE id = _suscripcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suscripción inexistente'; END IF;
  SELECT * INTO p FROM public.planes WHERE id = s.plan_id;

  -- Idempotencia: si ya está cancelada no se vuelve a tocar nada.
  IF s.estado = 'cancelada' OR s.cancelada_at IS NOT NULL THEN
    SELECT COALESCE(SUM(disponible),0) INTO v_disponible
      FROM public.vw_pagos_disponibles WHERE alumno_id = s.alumno_id;
    RETURN jsonb_build_object(
      'ya_aplicada', true, 'suscripcion_id', s.id, 'alumno_id', s.alumno_id,
      'plan_id', s.plan_id, 'estado', s.estado,
      'saldo_disponible_alumno', v_disponible);
  END IF;

  v_pagado := public.subscription_paid_amount(s.id);

  v_mp_real := EXISTS (SELECT 1 FROM public.mp_account_movements mp
                        WHERE mp.suscripcion_id = s.id AND mp.status = 'approved');
  v_credito_real := EXISTS (SELECT 1 FROM public.cuenta_ajustes ca
                             WHERE ca.tipo = 'credito'
                               AND ca.aplicado_a_fuente_tabla = 'suscripciones'
                               AND ca.aplicado_a_fuente_id = s.id);
  -- "Pago" sin ninguna evidencia real de dinero ingresado.
  v_ficticio := (NOT v_mp_real) AND (NOT v_credito_real) AND public.is_subscription_paid(s.id);

  -- Desimputar SOLO lo aplicado a esta obligación (no borra ningún pago).
  UPDATE public.pagos_imputaciones
     SET anulado_at = now(), anulado_por = auth.uid(),
         motivo_anulacion = COALESCE(_motivo, 'Baja de programa')
   WHERE obligacion_tipo = 'suscripcion' AND obligacion_id = s.id AND anulado_at IS NULL;
  GET DIAGNOSTICS v_anuladas = ROW_COUNT;

  -- Neutralizar HABER ficticio (carga manual sin operación real).
  IF v_ficticio OR _tratamiento_pago = 'sin_pago' THEN
    UPDATE public.suscripciones
       SET metodo_pago = 'pendiente', mp_status = NULL
     WHERE id = s.id;
  END IF;

  PERFORM set_config('app.sub_internal', 'on', true);
  UPDATE public.suscripciones
     SET estado = 'cancelada',
         cancelada_at = now(),
         cancelada_motivo = _motivo,
         baja_nota = COALESCE(baja_nota || E'\n', '')
           || format('[BAJA_PROGRAMA %s] %s (tratamiento: %s, pagado: %s)',
                     to_char(now(),'YYYY-MM-DD'), COALESCE(_motivo,'—'), _tratamiento_pago, v_pagado)
   WHERE id = s.id;
  PERFORM set_config('app.sub_internal', 'off', true);

  -- Reembolso externo: el dinero salió, se consume el disponible sin borrar el pago.
  IF _tratamiento_pago = 'reembolso_externo' AND v_mp_real THEN
    FOR v_mov IN
      SELECT id, amount FROM public.mp_account_movements
      WHERE suscripcion_id = s.id AND status = 'approved'
    LOOP
      PERFORM public.imputar_pago('mp_movement', v_mov.id, 'otro', s.id, s.alumno_id,
        v_mov.amount, COALESCE(p.moneda,'ARS'),
        jsonb_build_object('motivo','reembolso_externo','suscripcion_id', s.id));
    END LOOP;
  END IF;

  -- Recalcular cupo del programa (además del trigger de sincronización).
  UPDATE public.planes pl
     SET inscripciones_actuales = COALESCE((
       SELECT COUNT(*) FROM public.suscripciones su
       WHERE su.plan_id = pl.id
         AND su.estado IN ('activa','pendiente_pago','pendiente_verificacion')), 0)
   WHERE pl.id = s.plan_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), NULL, 'admin', 'baja_programa', 'suscripciones', s.id::text,
    jsonb_build_object('alumno_id', s.alumno_id, 'plan_id', s.plan_id,
      'plan_nombre', p.nombre, 'motivo', _motivo, 'tratamiento_pago', _tratamiento_pago,
      'pagado_real', v_pagado, 'pago_ficticio_neutralizado', v_ficticio,
      'imputaciones_anuladas', v_anuladas));

  SELECT COALESCE(SUM(disponible),0) INTO v_disponible
    FROM public.vw_pagos_disponibles WHERE alumno_id = s.alumno_id;

  RETURN jsonb_build_object(
    'ya_aplicada', false, 'suscripcion_id', s.id, 'alumno_id', s.alumno_id,
    'plan_id', s.plan_id, 'plan_nombre', p.nombre, 'estado', 'cancelada',
    'pagado_real', v_pagado, 'pago_ficticio_neutralizado', v_ficticio,
    'imputaciones_anuladas', v_anuladas, 'tratamiento_pago', _tratamiento_pago,
    'saldo_disponible_alumno', v_disponible,
    'inscripciones_actuales', (SELECT inscripciones_actuales FROM public.planes WHERE id = s.plan_id));
END; $$;

-- ---------- 5. Aplicar saldo disponible (total o parcial) ----------
CREATE OR REPLACE FUNCTION public.aplicar_saldo_disponible(
  _pago_origen_tipo text,
  _pago_origen_id uuid,
  _obligacion_tipo text,
  _obligacion_id uuid,
  _monto numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_alumno uuid; v_moneda text; v_disp numeric; v_id uuid; v_existente numeric := 0;
BEGIN
  IF NOT public._programa_admin_ok() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  SELECT alumno_id, moneda, disponible INTO v_alumno, v_moneda, v_disp
    FROM public.vw_pagos_disponibles
   WHERE pago_origen_tipo = _pago_origen_tipo AND pago_origen_id = _pago_origen_id;
  IF v_alumno IS NULL THEN RAISE EXCEPTION 'Pago no encontrado o sin alumno asignado'; END IF;

  -- Idempotencia: si ya existe la misma imputación activa por el mismo monto, no se duplica.
  SELECT monto INTO v_existente FROM public.pagos_imputaciones
   WHERE pago_origen_tipo = _pago_origen_tipo AND pago_origen_id = _pago_origen_id
     AND obligacion_tipo = _obligacion_tipo AND obligacion_id = _obligacion_id
     AND anulado_at IS NULL;

  IF v_existente IS NULL AND ROUND(_monto,2) > ROUND(v_disp,2) THEN
    RAISE EXCEPTION 'El monto a aplicar (%) supera el saldo disponible del pago (%)', _monto, v_disp;
  END IF;

  v_id := public.imputar_pago(_pago_origen_tipo, _pago_origen_id, _obligacion_tipo, _obligacion_id,
            v_alumno, _monto, v_moneda, jsonb_build_object('origen','saldo_disponible'));

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), NULL, 'admin', 'aplicar_saldo_disponible', 'pagos_imputaciones', v_id::text,
    jsonb_build_object('alumno_id', v_alumno, 'pago_origen_tipo', _pago_origen_tipo,
      'pago_origen_id', _pago_origen_id, 'obligacion_tipo', _obligacion_tipo,
      'obligacion_id', _obligacion_id, 'monto', _monto));

  RETURN jsonb_build_object('imputacion_id', v_id, 'alumno_id', v_alumno, 'monto', _monto,
    'disponible_restante', public.pago_saldo_disponible(_pago_origen_tipo, _pago_origen_id));
END; $$;

-- ---------- 6. Resolución de identidad antes de inscribir ----------
CREATE OR REPLACE FUNCTION public.resolve_alumno_for_enrollment(
  _email text, _nombre text, _apellido text, _telefono text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(_email,'')));
  v_tel text := public.normalizar_telefono_ar(_telefono);
  v_full text := public.normalizar_nombre(_nombre) || ' ' || public.normalizar_nombre(_apellido);
  a public.alumnos;
BEGIN
  -- 1) email principal o adicional
  SELECT * INTO a FROM public.alumnos
   WHERE COALESCE(estado,'') <> 'fusionada'
     AND (lower(email) = v_email
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(emails_adicionales, '{}'::text[])) e WHERE lower(e) = v_email))
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('alumno_id', a.id, 'match', 'email',
      'agregar_email_adicional', lower(a.email) <> v_email, 'email_principal', a.email);
  END IF;

  IF v_tel IS NULL THEN
    RETURN jsonb_build_object('alumno_id', NULL, 'match', 'nuevo', 'agregar_email_adicional', false);
  END IF;

  -- 2) mismo teléfono + nombre y apellido compatibles → misma persona
  SELECT * INTO a FROM public.alumnos
   WHERE COALESCE(estado,'') <> 'fusionada'
     AND public.normalizar_telefono_ar(telefono) = v_tel
     AND public.normalizar_nombre(nombre) || ' ' || public.normalizar_nombre(apellido) = v_full
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('alumno_id', a.id, 'match', 'telefono_nombre',
      'agregar_email_adicional', true, 'email_principal', a.email);
  END IF;

  -- 3) mismo teléfono, persona aparentemente distinta → NO fusionar
  SELECT * INTO a FROM public.alumnos
   WHERE COALESCE(estado,'') <> 'fusionada'
     AND public.normalizar_telefono_ar(telefono) = v_tel
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('alumno_id', NULL, 'match', 'posible_duplicado',
      'agregar_email_adicional', false,
      'posible_duplicado_alumno_id', a.id,
      'posible_duplicado_nombre', btrim(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')),
      'telefono_normalizado', v_tel);
  END IF;

  RETURN jsonb_build_object('alumno_id', NULL, 'match', 'nuevo', 'agregar_email_adicional', false);
END; $$;

-- ---------- 7. ¿Ya está inscripto? ----------
CREATE OR REPLACE FUNCTION public.check_programa_enrollment(_alumno_id uuid, _plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.suscripciones; v_pagado numeric;
BEGIN
  SELECT * INTO s FROM public.suscripciones
   WHERE alumno_id = _alumno_id AND plan_id = _plan_id
     AND cancelada_at IS NULL
     AND estado IN ('activa','pendiente','pendiente_pago','pendiente_verificacion')
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('already_enrolled', false); END IF;
  v_pagado := public.subscription_paid_amount(s.id);
  RETURN jsonb_build_object(
    'already_enrolled', true, 'code', 'ALREADY_ENROLLED',
    'alumno_id', s.alumno_id, 'suscripcion_id', s.id, 'estado', s.estado,
    'monto', COALESCE(s.precio_final, s.precio_base, 0),
    'pagado', v_pagado,
    'saldo', GREATEST(0, COALESCE(s.precio_final, s.precio_base, 0) - v_pagado),
    'plan_nombre', (SELECT nombre FROM public.planes WHERE id = _plan_id));
END; $$;

-- ---------- 8. Detector de posibles duplicados por programa ----------
DROP VIEW IF EXISTS public.vw_programa_posibles_duplicados;
CREATE VIEW public.vw_programa_posibles_duplicados AS
WITH vig AS (
  SELECT s.id AS suscripcion_id, s.plan_id, s.estado, s.alumno_id,
         a.nombre, a.apellido, a.email,
         public.normalizar_telefono_ar(a.telefono) AS tel,
         public.normalizar_nombre(a.nombre) AS n_nombre,
         public.normalizar_nombre(a.apellido) AS n_apellido
  FROM public.suscripciones s
  JOIN public.alumnos a ON a.id = s.alumno_id
  JOIN public.planes p ON p.id = s.plan_id
  WHERE p.es_programa_cerrado
    AND s.cancelada_at IS NULL
    AND s.estado IN ('activa','pendiente','pendiente_pago','pendiente_verificacion')
)
SELECT
  v1.plan_id,
  (SELECT nombre FROM public.planes WHERE id = v1.plan_id) AS plan_nombre,
  v1.alumno_id AS alumno_1_id,
  btrim(COALESCE(v1.nombre,'') || ' ' || COALESCE(v1.apellido,'')) AS alumno_1_nombre,
  v1.email AS alumno_1_email,
  v2.alumno_id AS alumno_2_id,
  btrim(COALESCE(v2.nombre,'') || ' ' || COALESCE(v2.apellido,'')) AS alumno_2_nombre,
  v2.email AS alumno_2_email,
  v1.tel AS telefono_normalizado,
  CASE
    WHEN v1.n_nombre = v2.n_nombre AND v1.n_apellido = v2.n_apellido THEN 'mismo teléfono + mismo nombre y apellido'
    WHEN v1.n_apellido = v2.n_apellido THEN 'mismo teléfono + mismo apellido'
    ELSE 'mismo teléfono'
  END AS motivo_match,
  CASE
    WHEN v1.n_nombre = v2.n_nombre AND v1.n_apellido = v2.n_apellido THEN 'ALTA'
    WHEN v1.n_apellido = v2.n_apellido THEN 'MEDIA'
    ELSE 'BAJA'
  END AS nivel_confianza,
  v1.suscripcion_id AS suscripcion_1_id,
  v2.suscripcion_id AS suscripcion_2_id,
  v1.estado AS estado_1,
  v2.estado AS estado_2
FROM vig v1
JOIN vig v2
  ON v2.plan_id = v1.plan_id
 AND v2.tel = v1.tel
 AND v2.alumno_id <> v1.alumno_id
 AND v1.alumno_id < v2.alumno_id
WHERE v1.tel IS NOT NULL;

GRANT SELECT ON public.vw_programa_posibles_duplicados TO authenticated;
GRANT SELECT ON public.vw_programa_posibles_duplicados TO service_role;

-- ---------- 9. Barrera de base de datos (cross-ficha, evidencia fuerte) ----------
CREATE OR REPLACE FUNCTION public.guard_programa_duplicado_cross_ficha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tel text; v_nom text; v_ape text; v_otro uuid;
BEGIN
  IF NEW.estado NOT IN ('activa','pendiente','pendiente_pago','pendiente_verificacion')
     OR NEW.cancelada_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.planes WHERE id = NEW.plan_id AND es_programa_cerrado) THEN
    RETURN NEW;
  END IF;

  SELECT public.normalizar_telefono_ar(telefono), public.normalizar_nombre(nombre), public.normalizar_nombre(apellido)
    INTO v_tel, v_nom, v_ape
    FROM public.alumnos WHERE id = NEW.alumno_id;
  IF v_tel IS NULL OR v_nom IS NULL OR v_ape IS NULL THEN RETURN NEW; END IF;

  SELECT s.alumno_id INTO v_otro
  FROM public.suscripciones s
  JOIN public.alumnos a ON a.id = s.alumno_id
  WHERE s.plan_id = NEW.plan_id
    AND s.id <> NEW.id
    AND s.alumno_id <> NEW.alumno_id
    AND s.cancelada_at IS NULL
    AND s.estado IN ('activa','pendiente','pendiente_pago','pendiente_verificacion')
    AND public.normalizar_telefono_ar(a.telefono) = v_tel
    AND public.normalizar_nombre(a.nombre) = v_nom
    AND public.normalizar_nombre(a.apellido) = v_ape
  LIMIT 1;

  IF v_otro IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICADO_CROSS_FICHA: esta persona ya tiene una inscripción vigente a este programa con otra ficha (alumno %)', v_otro
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_programa_duplicado_cross_ficha ON public.suscripciones;
CREATE TRIGGER trg_guard_programa_duplicado_cross_ficha
  BEFORE INSERT OR UPDATE OF estado, alumno_id, plan_id ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.guard_programa_duplicado_cross_ficha();

-- ---------- 10. Tests reproducibles (crean y revierten sus datos) ----------
CREATE OR REPLACE FUNCTION public.run_programa_bajas_tests()
RETURNS TABLE(test integer, estado text, nombre text, detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_cta uuid; v_plan uuid := gen_random_uuid();
  v_a1 uuid := gen_random_uuid(); v_a2 uuid := gen_random_uuid(); v_a3 uuid := gen_random_uuid();
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_mp uuid; v_mens uuid; v_smens uuid;
  v_tel text := '+54 9 11 4444-'; v_res jsonb; v_x numeric; v_y numeric; v_n int; v_err text;
  v_planm uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;
  BEGIN
    PERFORM set_config('app.programa_test', 'on', true);

    INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia, es_programa_cerrado,
                               max_inscripciones, cohort_slug, fecha_inicio_programa, fecha_fin_programa)
    VALUES (v_plan, 'QA Programa ' || left(v_plan::text,8), 164000, 'ARS', true, 'unico', true,
            15, 'qa_' || left(v_plan::text,8), CURRENT_DATE, CURRENT_DATE + 60);
    INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia)
    VALUES (v_planm, 'QA Mensual ' || left(v_planm::text,8), 83500, 'ARS', true, 'mensual');

    INSERT INTO public.alumnos (id, nombre, apellido, email, telefono, grupo, estado) VALUES
      (v_a1, 'Qa', 'Programa', 'qa-'||v_a1||'@test.local', v_tel||'0001', 'Sin grupo', 'activo'),
      (v_a2, 'Qa', 'Programa', 'qa-'||v_a2||'@test.local', v_tel||'0001', 'Sin grupo', 'activo'),
      (v_a3, 'Otro', 'Distinto', 'qa-'||v_a3||'@test.local', v_tel||'0001', 'Sin grupo', 'activo');

    PERFORM set_config('app.sub_internal','on',true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_a1, v_plan, 'activa', 'mercadopago', 'automatico', 164000, 164000, CURRENT_DATE, CURRENT_DATE+60)
    RETURNING id INTO v_s1;

    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, amount, currency, status,
      fecha_movimiento, alumno_id, suscripcion_id, direccion, description)
    VALUES (v_cta, 'QA-'||left(v_s1::text,10), 164000, 'ARS', 'approved', now(), v_a1, v_s1, 'ingreso', 'QA pago programa')
    RETURNING id INTO v_mp;

    ---------------- TEST 1: mismo email + mismo programa → ya inscripto
    v_res := public.check_programa_enrollment(v_a1, v_plan);
    v_out := v_out || jsonb_build_object('t',1,'n','Mismo alumno + mismo programa → ALREADY_ENROLLED',
      'ok', (v_res->>'already_enrolled')::boolean AND v_res->>'code' = 'ALREADY_ENROLLED', 'd', v_res::text);

    ---------------- TEST 2: email adicional conocido → no crea ficha nueva
    UPDATE public.alumnos SET emails_adicionales = ARRAY['qa-alt-'||v_a1||'@test.local'] WHERE id = v_a1;
    v_res := public.resolve_alumno_for_enrollment('qa-alt-'||v_a1||'@test.local','Qa','Programa', v_tel||'0001');
    v_out := v_out || jsonb_build_object('t',2,'n','Email adicional conocido → usa la ficha existente',
      'ok', (v_res->>'alumno_id')::uuid = v_a1 AND v_res->>'match' = 'email', 'd', v_res::text);

    ---------------- TEST 3: email nuevo + mismo teléfono + mismo nombre → misma persona
    v_res := public.resolve_alumno_for_enrollment('nuevo-'||v_a1||'@test.local','QA','programa', '11 4444-0001');
    v_out := v_out || jsonb_build_object('t',3,'n','Email nuevo + teléfono + nombre → misma persona, agrega email adicional',
      'ok', (v_res->>'alumno_id') IS NOT NULL AND v_res->>'match' = 'telefono_nombre'
            AND (v_res->>'agregar_email_adicional')::boolean, 'd', v_res::text);

    ---------------- TEST 4: mismo teléfono + persona distinta → no fusiona
    v_res := public.resolve_alumno_for_enrollment('nuevo2-'||v_a3||'@test.local','Tercero','Ajeno', v_tel||'0001');
    v_out := v_out || jsonb_build_object('t',4,'n','Mismo teléfono + persona distinta → POSIBLE_DUPLICADO, no fusiona',
      'ok', (v_res->>'alumno_id') IS NULL AND v_res->>'match' = 'posible_duplicado', 'd', v_res::text);

    ---------------- TEST 5: barrera cross-ficha (mismo tel + mismo nombre, otra ficha)
    v_err := NULL;
    BEGIN
      INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
        precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (v_a2, v_plan, 'activa', 'pendiente', 'cargado_admin', 164000, 164000, CURRENT_DATE, CURRENT_DATE+60);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_out := v_out || jsonb_build_object('t',5,'n','Barrera BD: doble inscripción cross-ficha con evidencia fuerte',
      'ok', v_err ILIKE '%DUPLICADO_CROSS_FICHA%', 'd', COALESCE(v_err,'no bloqueó'));

    ---------------- TEST 6: teléfono igual pero persona distinta → NO bloquea
    v_err := NULL;
    BEGIN
      INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
        precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (v_a3, v_plan, 'activa', 'pendiente', 'cargado_admin', 164000, 164000, CURRENT_DATE, CURRENT_DATE+60)
      RETURNING id INTO v_s3;
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_out := v_out || jsonb_build_object('t',6,'n','Solo coincide teléfono → advertencia, no bloqueo',
      'ok', v_err IS NULL, 'd', COALESCE(v_err,'permitido (correcto)'));

    ---------------- TEST 7: detector de posibles duplicados
    SELECT COUNT(*) INTO v_n FROM public.vw_programa_posibles_duplicados WHERE plan_id = v_plan;
    v_out := v_out || jsonb_build_object('t',7,'n','Detector cross-ficha encuentra el posible duplicado',
      'ok', v_n >= 1, 'd', format('%s par(es) detectados', v_n));

    ---------------- TEST 8: baja de programa SIN pago
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_a2, v_planm, 'pendiente', 'pendiente', 'cargado_admin', 83500, 83500, CURRENT_DATE, CURRENT_DATE+30)
    RETURNING id INTO v_s2;
    UPDATE public.planes SET es_programa_cerrado = true WHERE id = v_planm;
    v_res := public.dar_de_baja_programa(v_s2, 'QA baja sin pago', 'sin_pago');
    v_out := v_out || jsonb_build_object('t',8,'n','Baja sin pago: cancela y libera cupo',
      'ok', v_res->>'estado' = 'cancelada' AND (v_res->>'pagado_real')::numeric = 0, 'd', v_res::text);
    UPDATE public.planes SET es_programa_cerrado = false WHERE id = v_planm;

    ---------------- TEST 9: baja de programa PAGADO → conserva el pago disponible
    SELECT inscripciones_actuales INTO v_n FROM public.planes WHERE id = v_plan;
    v_res := public.dar_de_baja_programa(v_s1, 'QA baja pagada', 'conservar_como_disponible');
    SELECT disponible INTO v_x FROM public.vw_pagos_disponibles WHERE pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',9,'n','Baja pagada: libera cupo, conserva el pago como disponible',
      'ok', (v_res->>'pagado_real')::numeric = 164000 AND v_x = 164000
            AND (v_res->>'inscripciones_actuales')::int = v_n - 1,
      'd', format('pagado=%s disponible=%s cupos %s→%s', v_res->>'pagado_real', v_x, v_n, v_res->>'inscripciones_actuales'));

    ---------------- TEST 10: el pago MP sigue existiendo
    SELECT COUNT(*) INTO v_n FROM public.mp_account_movements WHERE id = v_mp AND status = 'approved';
    v_out := v_out || jsonb_build_object('t',10,'n','La baja no borra el pago real de Mercado Pago',
      'ok', v_n = 1, 'd', format('movimientos MP conservados: %s', v_n));

    ---------------- TEST 11: cancelar dos veces es idempotente
    v_res := public.dar_de_baja_programa(v_s1, 'QA baja repetida', 'conservar_como_disponible');
    SELECT disponible INTO v_y FROM public.vw_pagos_disponibles WHERE pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',11,'n','Cancelar dos veces no duplica saldo ni cupos',
      'ok', (v_res->>'ya_aplicada')::boolean AND v_y = 164000, 'd', format('disponible tras 2ª baja=%s', v_y));

    ---------------- TEST 12: aplicación PARCIAL del saldo disponible
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_a1, v_planm, 'pendiente', 'pendiente', 'cargado_admin', 83500, 83500,
            date_trunc('month', CURRENT_DATE)::date, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date)
    RETURNING id INTO v_smens;
    v_res := public.aplicar_saldo_disponible('mp_movement', v_mp, 'suscripcion', v_smens, 83500);
    SELECT disponible INTO v_x FROM public.vw_pagos_disponibles WHERE pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',12,'n','Pago 164.000 aplicado 83.500 → quedan 80.500 disponibles',
      'ok', v_x = 80500 AND public.obligacion_imputado('suscripcion', v_smens) = 83500,
      'd', format('disponible=%s imputado=%s', v_x, public.obligacion_imputado('suscripcion', v_smens)));

    ---------------- TEST 13: aplicar dos veces lo mismo es idempotente
    v_res := public.aplicar_saldo_disponible('mp_movement', v_mp, 'suscripcion', v_smens, 83500);
    SELECT COUNT(*) INTO v_n FROM public.pagos_imputaciones
      WHERE pago_origen_id = v_mp AND obligacion_id = v_smens AND anulado_at IS NULL;
    SELECT disponible INTO v_y FROM public.vw_pagos_disponibles WHERE pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',13,'n','Aplicar dos veces la misma imputación es idempotente',
      'ok', v_n = 1 AND v_y = 80500, 'd', format('imputaciones=%s disponible=%s', v_n, v_y));

    ---------------- TEST 14: no se puede aplicar más que el disponible
    v_err := NULL;
    BEGIN
      PERFORM public.aplicar_saldo_disponible('mp_movement', v_mp, 'otro', gen_random_uuid(), 999999);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_out := v_out || jsonb_build_object('t',14,'n','No se puede aplicar más dinero del disponible',
      'ok', v_err IS NOT NULL, 'd', COALESCE(v_err,'permitió sobregiro'));

    ---------------- TEST 15: pago manual sin operación real → sin crédito ficticio
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_a3, v_planm, 'activa', 'mp_externo_claudio', 'cargado_admin', 175000, 175000,
            CURRENT_DATE, CURRENT_DATE+30)
    RETURNING id INTO v_s2;
    SELECT COALESCE(SUM(haber),0) INTO v_x FROM public.vw_cuenta_corriente_movimientos
      WHERE alumno_id = v_a3;
    UPDATE public.planes SET es_programa_cerrado = true WHERE id = v_planm;
    v_res := public.dar_de_baja_programa(v_s2, 'QA pago ficticio', 'conservar_como_disponible');
    SELECT COALESCE(SUM(haber),0) INTO v_y FROM public.vw_cuenta_corriente_movimientos
      WHERE alumno_id = v_a3;
    UPDATE public.planes SET es_programa_cerrado = false WHERE id = v_planm;
    v_out := v_out || jsonb_build_object('t',15,'n','Pago manual sin operación real → no deja saldo a favor ficticio',
      'ok', v_x >= 175000 AND v_y = 0 AND (v_res->>'pago_ficticio_neutralizado')::boolean,
      'd', format('haber antes=%s después=%s', v_x, v_y));

    ---------------- TEST 16: la inscripción cancelada no ocupa cupo ni figura activa
    SELECT COUNT(*) INTO v_n FROM public.suscripciones
      WHERE plan_id = v_plan AND estado IN ('activa','pendiente_pago','pendiente_verificacion');
    SELECT inscripciones_actuales INTO v_x FROM public.planes WHERE id = v_plan;
    v_out := v_out || jsonb_build_object('t',16,'n','Inscripción cancelada no cuenta como cupo ni como inscripto activo',
      'ok', v_x = v_n, 'd', format('vigentes=%s inscripciones_actuales=%s', v_n, v_x));

    ---------------- TEST 17: preview de merge conserva trazabilidad
    v_res := public.preview_merge_alumnos(v_a1, v_a2);
    v_out := v_out || jsonb_build_object('t',17,'n','Preview de merge lista los registros a mover',
      'ok', v_res ? 'total_registros', 'd', v_res::text);

    RAISE EXCEPTION 'ROLLBACK_TESTS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TESTS' THEN
      v_out := v_out || jsonb_build_object('t', 0, 'n', 'ERROR FATAL durante los tests de programas', 'ok', false, 'd', SQLERRM);
    END IF;
  END;

  RETURN QUERY
  SELECT (e->>'t')::int,
         CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,
         e->>'n', e->>'d'
  FROM jsonb_array_elements(v_out) e
  ORDER BY (e->>'t')::int;
END; $$;

GRANT EXECUTE ON FUNCTION public.dar_de_baja_programa(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_saldo_disponible(text, uuid, text, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_alumno_for_enrollment(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_programa_enrollment(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_programa_bajas_tests() TO authenticated;