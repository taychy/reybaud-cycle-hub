-- 1) Vista: reemplazar la rama "pago_suscripcion" por dos ramas
--    (una fila por movimiento MP aprobado / fila única para pagos no-MP)
DO $mig$
DECLARE
  def text;
  s1 int; s2 int; rest text; removed text; nueva text;
BEGIN
  def := pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass, true);

  s1 := strpos(def, 'UNION ALL');
  IF s1 = 0 THEN RAISE EXCEPTION 'No se encontró la primera UNION ALL'; END IF;
  rest := substr(def, s1 + 9);
  s2 := strpos(rest, 'UNION ALL');
  IF s2 = 0 THEN RAISE EXCEPTION 'No se encontró la segunda UNION ALL'; END IF;
  s2 := s1 + 9 + s2 - 1;

  removed := substr(def, s1 + 9, s2 - (s1 + 9));
  IF position('pago_suscripcion' in removed) = 0
     OR position('is_subscription_paid' in removed) = 0 THEN
    RAISE EXCEPTION 'La rama esperada (pago_suscripcion) no coincide: %', left(removed, 200);
  END IF;

  nueva := $branch$
 SELECT s.alumno_id,
    (mp.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
    'pago_suscripcion'::text AS tipo,
    ('Pago plan: '::text || COALESCE(p.nombre, '—'::text)) || ' (mercadopago)'::text AS concepto,
    'mp_account_movements'::text AS fuente_tabla,
    mp.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(mp.amount, 0::numeric) AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('suscripcion_id', s.id, 'plan_id', s.plan_id, 'plan_nombre', p.nombre,
      'metodo_pago', 'mercadopago', 'origen_registro', s.origen_registro,
      'mp_payment_id', mp.mp_payment_id, 'mp_movement_id', mp.id,
      'cuenta_mp_id', mp.cuenta_mp_id, 'notas', s.notas,
      'fecha_pago', mp.fecha_movimiento) AS referencia_extra
   FROM mp_account_movements mp
     JOIN suscripciones s ON s.id = mp.suscripcion_id
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE mp.status = 'approved'::text
    AND s.cancelada_at IS NULL
    AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'finalizada'::text, 'conciliado'::text]))
    AND is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id)
UNION ALL
 SELECT s.alumno_id,
    COALESCE(
        CASE
            WHEN s.origen_registro = ANY (ARRAY['automatico'::text, 'cargado_admin'::text]) THEN s.fecha_inicio
            ELSE NULL::date
        END, s.updated_at::date) AS fecha,
    'pago_suscripcion'::text AS tipo,
    ('Pago plan: '::text || COALESCE(p.nombre, '—'::text)) ||
        CASE
            WHEN s.metodo_pago = 'saldo_a_favor'::text AND (EXISTS ( SELECT 1
               FROM cuenta_ajustes ca
              WHERE ca.tipo = 'credito'::text AND ca.aplicado_a_fuente_tabla = 'suscripciones'::text AND ca.aplicado_a_fuente_id = s.id)) THEN ' (saldo a favor aplicado)'::text
            WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'::text THEN (' ('::text || s.metodo_pago) || ')'::text
            ELSE ''::text
        END AS concepto,
    'suscripciones'::text AS fuente_tabla,
    s.id AS fuente_id,
    0::numeric AS debe,
        CASE
            WHEN s.metodo_pago = 'saldo_a_favor'::text AND (EXISTS ( SELECT 1
               FROM cuenta_ajustes ca
              WHERE ca.tipo = 'credito'::text AND ca.aplicado_a_fuente_tabla = 'suscripciones'::text AND ca.aplicado_a_fuente_id = s.id)) THEN 0::numeric
            ELSE COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
        END AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', s.metodo_pago, 'origen_registro', s.origen_registro, 'mp_payment_id', s.mp_payment_id, 'cuenta_mp_id', s.cuenta_mp_id, 'notas', s.notas, 'fecha_pago', s.fecha_inicio) AS referencia_extra
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL
    AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'finalizada'::text, 'conciliado'::text]))
    AND is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id)
    AND NOT EXISTS ( SELECT 1
       FROM mp_account_movements mp2
      WHERE mp2.suscripcion_id = s.id AND mp2.status = 'approved'::text)
$branch$;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS '
       || substr(def, 1, s1 + 8) || E'\n' || nueva || E'\n' || substr(def, s2);
END
$mig$;

-- 2) Consumidores: normalizar los pagos MP a la clave de la suscripción
DO $mig$
DECLARE d text; o text;
BEGIN
  -- get_cuenta_publica
  d := pg_get_functiondef('public.get_cuenta_publica(uuid,text,text)'::regprocedure);
  o := d;
  d := replace(d,
$old$  WITH pagos AS (
    SELECT fuente_tabla, fuente_id, SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = v_token_row.alumno_id AND haber > 0
    GROUP BY fuente_tabla, fuente_id
  ),$old$,
$new$  WITH pagos AS (
    SELECT
      CASE WHEN fuente_tabla = 'mp_account_movements' AND referencia_extra ? 'suscripcion_id'
           THEN 'suscripciones' ELSE fuente_tabla END AS fuente_tabla,
      CASE WHEN fuente_tabla = 'mp_account_movements' AND referencia_extra ? 'suscripcion_id'
           THEN (referencia_extra->>'suscripcion_id')::uuid ELSE fuente_id END AS fuente_id,
      SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = v_token_row.alumno_id AND haber > 0
    GROUP BY 1, 2
  ),$new$);
  IF d = o THEN RAISE EXCEPTION 'get_cuenta_publica: no se pudo parchear'; END IF;
  EXECUTE d;

  -- get_cuenta_publica_deudas_raw
  d := pg_get_functiondef('public.get_cuenta_publica_deudas_raw(uuid)'::regprocedure);
  o := d;
  d := replace(d,
$old$  WITH pagos AS (
    SELECT fuente_tabla, fuente_id, SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = p_alumno_id AND haber > 0
    GROUP BY fuente_tabla, fuente_id
  )$old$,
$new$  WITH pagos AS (
    SELECT
      CASE WHEN fuente_tabla = 'mp_account_movements' AND referencia_extra ? 'suscripcion_id'
           THEN 'suscripciones' ELSE fuente_tabla END AS fuente_tabla,
      CASE WHEN fuente_tabla = 'mp_account_movements' AND referencia_extra ? 'suscripcion_id'
           THEN (referencia_extra->>'suscripcion_id')::uuid ELSE fuente_id END AS fuente_id,
      SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = p_alumno_id AND haber > 0
    GROUP BY 1, 2
  )$new$);
  IF d = o THEN RAISE EXCEPTION 'get_cuenta_publica_deudas_raw: no se pudo parchear'; END IF;
  EXECUTE d;

  -- cuenta_publica_consume_credit
  d := pg_get_functiondef('public.cuenta_publica_consume_credit(uuid,text,uuid)'::regprocedure);
  o := d;
  d := replace(d,
$old$    WHERE alumno_id = v_token.alumno_id AND fuente_tabla='suscripciones' AND fuente_id = p_fuente_id$old$,
$new$    WHERE alumno_id = v_token.alumno_id AND (
            (fuente_tabla='suscripciones' AND fuente_id = p_fuente_id)
         OR (fuente_tabla='mp_account_movements' AND (referencia_extra->>'suscripcion_id')::uuid = p_fuente_id))$new$);
  IF d = o THEN RAISE EXCEPTION 'cuenta_publica_consume_credit: no se pudo parchear'; END IF;
  EXECUTE d;

  -- preview_baja_programa
  d := pg_get_functiondef('public.preview_baja_programa(uuid)'::regprocedure);
  o := d;
  d := replace(d,
$old$   WHERE m.fuente_tabla = 'suscripciones' AND m.fuente_id = _suscripcion_id;$old$,
$new$   WHERE (m.fuente_tabla = 'suscripciones' AND m.fuente_id = _suscripcion_id)
      OR (m.fuente_tabla = 'mp_account_movements' AND (m.referencia_extra->>'suscripcion_id')::uuid = _suscripcion_id);$new$);
  IF d = o THEN RAISE EXCEPTION 'preview_baja_programa: no se pudo parchear'; END IF;
  EXECUTE d;

  -- get_deudores_cobranzas
  d := pg_get_functiondef('public.get_deudores_cobranzas()'::regprocedure);
  o := d;
  d := replace(d,
$old$      CASE WHEN m.fuente_tabla = 'reservation_payments' THEN 'event_reservations' ELSE m.fuente_tabla END AS fuente_tabla,
      CASE WHEN m.fuente_tabla = 'reservation_payments'
           THEN COALESCE((m.referencia_extra->>'reservation_id')::uuid, m.fuente_id)
           ELSE m.fuente_id END AS fuente_id,$old$,
$new$      CASE WHEN m.fuente_tabla = 'reservation_payments' THEN 'event_reservations'
           WHEN m.fuente_tabla = 'mp_account_movements' AND m.referencia_extra ? 'suscripcion_id' THEN 'suscripciones'
           ELSE m.fuente_tabla END AS fuente_tabla,
      CASE WHEN m.fuente_tabla = 'reservation_payments'
           THEN COALESCE((m.referencia_extra->>'reservation_id')::uuid, m.fuente_id)
           WHEN m.fuente_tabla = 'mp_account_movements' AND m.referencia_extra ? 'suscripcion_id'
           THEN (m.referencia_extra->>'suscripcion_id')::uuid
           ELSE m.fuente_id END AS fuente_id,$new$);
  IF d = o THEN RAISE EXCEPTION 'get_deudores_cobranzas: no se pudo parchear'; END IF;
  EXECUTE d;

  -- get_saldo_alumno: evitar doble conteo del "parche legacy" para subs con MP
  d := pg_get_functiondef('public.get_saldo_alumno(uuid)'::regprocedure);
  o := d;
  d := replace(d,
$old$      AND NOT EXISTS (
        SELECT 1
        FROM public.vw_cuenta_corriente_movimientos vm
        WHERE vm.fuente_tabla = 'suscripciones'
          AND vm.fuente_id = s.id
          AND vm.tipo = 'pago_suscripcion'
      )$old$,
$new$      AND NOT EXISTS (
        SELECT 1
        FROM public.vw_cuenta_corriente_movimientos vm
        WHERE vm.tipo = 'pago_suscripcion'
          AND (
            (vm.fuente_tabla = 'suscripciones' AND vm.fuente_id = s.id)
            OR (vm.fuente_tabla = 'mp_account_movements' AND (vm.referencia_extra->>'suscripcion_id')::uuid = s.id)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.mp_account_movements mm
        WHERE mm.suscripcion_id = s.id AND mm.status = 'approved'
      )$new$);
  IF d = o THEN RAISE EXCEPTION 'get_saldo_alumno: no se pudo parchear'; END IF;
  EXECUTE d;

  -- run_financial_regression_tests_core: normalizar las verificaciones por suscripción
  d := pg_get_functiondef('public.run_financial_regression_tests_core()'::regprocedure);
  o := d;
  d := replace(d, 'WHERE fuente_id = v_sub',
       'WHERE COALESCE((referencia_extra->>''suscripcion_id'')::uuid, fuente_id) = v_sub');
  IF d = o THEN RAISE EXCEPTION 'run_financial_regression_tests_core: no se pudo parchear'; END IF;
  EXECUTE d;
END
$mig$;

-- 3) Pruebas de regresión específicas (transacción propia, hace ROLLBACK de sus fixtures)
CREATE OR REPLACE FUNCTION public.run_cuenta_corriente_pagos_parciales_tests()
RETURNS TABLE(test integer, estado text, nombre text, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_admin uuid; v_cta uuid;
  v_alumno uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
  v_sub uuid; v_n int; v_sum numeric; v_saldo numeric; v_cargos int;
  v_i int;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;

  BEGIN
    INSERT INTO public.alumnos (id, nombre, apellido, email, grupo, estado)
    VALUES (v_alumno, 'QA', 'Parciales', 'qa-' || v_alumno || '@test.local', 'Sin grupo', 'activo');
    INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia)
    VALUES (v_plan, 'QA Parciales ' || left(v_plan::text, 8), 187000, 'ARS', true, 'mensual');

    -- ---- TEST 1: un solo pago MP ----
    PERFORM set_config('app.sub_internal', 'on', true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                      mp_status, precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_alumno, v_plan, 'activa', 'mercadopago', 'automatico', 'approved', 187000, 187000,
            date_trunc('month', CURRENT_DATE)::date,
            (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date)
    RETURNING id INTO v_sub;
    PERFORM set_config('app.sub_internal', 'off', true);

    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                             currency, direccion, fecha_movimiento, alumno_id, suscripcion_id)
    VALUES (v_cta, 'QA-' || substr(gen_random_uuid()::text, 1, 12), 'payment', 'approved',
            187000, 'ARS', 'ingreso', now(), v_alumno, v_sub);

    SELECT count(*), COALESCE(SUM(haber), 0) INTO v_n, v_sum
      FROM public.vw_cuenta_corriente_movimientos
     WHERE alumno_id = v_alumno AND tipo = 'pago_suscripcion';
    v_out := v_out || jsonb_build_object('t', 1, 'n', '1 pago MP: una sola fila de pago por el importe real',
      'ok', v_n = 1 AND v_sum = 187000, 'd', format('filas=%s total=%s', v_n, v_sum));

    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 1, 'n', '1 pago MP: saldo 0',
      'ok', ROUND(v_saldo, 2) = 0, 'd', 'saldo=' || ROUND(v_saldo, 2));

    -- ---- TEST 2: dos cuotas de 93.500 (caso de regresión) ----
    DELETE FROM public.mp_account_movements WHERE suscripcion_id = v_sub;
    FOR v_i IN 1..2 LOOP
      INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                               currency, direccion, fecha_movimiento, alumno_id, suscripcion_id)
      VALUES (v_cta, 'QA-' || substr(gen_random_uuid()::text, 1, 12), 'payment', 'approved',
              93500, 'ARS', 'ingreso', now() - (v_i || ' days')::interval, v_alumno, v_sub);
    END LOOP;

    SELECT count(*), COALESCE(SUM(haber), 0) INTO v_n, v_sum
      FROM public.vw_cuenta_corriente_movimientos
     WHERE alumno_id = v_alumno AND tipo = 'pago_suscripcion';
    SELECT count(*) INTO v_cargos FROM public.vw_cuenta_corriente_movimientos
     WHERE alumno_id = v_alumno AND tipo = 'cargo_suscripcion';
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 2, 'n', '2 pagos MP: 1 cargo 187.000 + 2 pagos 93.500 y saldo 0',
      'ok', v_cargos = 1 AND v_n = 2 AND v_sum = 187000 AND ROUND(v_saldo, 2) = 0,
      'd', format('cargos=%s pagos=%s total=%s saldo=%s', v_cargos, v_n, v_sum, ROUND(v_saldo, 2)));
    v_out := v_out || jsonb_build_object('t', 2, 'n', '2 pagos MP: no hay fila agregada por el total',
      'ok', NOT EXISTS (SELECT 1 FROM public.vw_cuenta_corriente_movimientos
                        WHERE alumno_id = v_alumno AND tipo = 'pago_suscripcion' AND haber = 187000),
      'd', 'sin fila agregada');
    v_out := v_out || jsonb_build_object('t', 2, 'n', '2 pagos MP: cada fila conserva suscripcion_id y su movimiento',
      'ok', (SELECT count(*) FROM public.vw_cuenta_corriente_movimientos m
              WHERE m.alumno_id = v_alumno AND m.tipo = 'pago_suscripcion'
                AND m.fuente_tabla = 'mp_account_movements'
                AND (m.referencia_extra->>'suscripcion_id')::uuid = v_sub
                AND EXISTS (SELECT 1 FROM public.mp_account_movements mm WHERE mm.id = m.fuente_id)) = 2,
      'd', 'trazabilidad ok');

    -- ---- TEST 3: tres pagos parciales ----
    DELETE FROM public.mp_account_movements WHERE suscripcion_id = v_sub;
    FOR v_i IN 1..3 LOOP
      INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                               currency, direccion, fecha_movimiento, alumno_id, suscripcion_id)
      VALUES (v_cta, 'QA-' || substr(gen_random_uuid()::text, 1, 12), 'payment', 'approved',
              CASE v_i WHEN 3 THEN 87000 ELSE 50000 END, 'ARS', 'ingreso',
              now() - (v_i || ' days')::interval, v_alumno, v_sub);
    END LOOP;
    SELECT count(*), COALESCE(SUM(haber), 0) INTO v_n, v_sum
      FROM public.vw_cuenta_corriente_movimientos
     WHERE alumno_id = v_alumno AND tipo = 'pago_suscripcion';
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 3, 'n', '3 pagos parciales: 3 filas, suma 187.000, saldo 0',
      'ok', v_n = 3 AND v_sum = 187000 AND ROUND(v_saldo, 2) = 0,
      'd', format('pagos=%s total=%s saldo=%s', v_n, v_sum, ROUND(v_saldo, 2)));

    -- ---- TEST 4: pago no-MP (transferencia) sin movimientos ----
    DELETE FROM public.mp_account_movements WHERE suscripcion_id = v_sub;
    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones SET metodo_pago = 'transferencia', origen_registro = 'informado_alumno',
           mp_status = NULL, mp_payment_id = NULL, chequeado_admin = true WHERE id = v_sub;
    PERFORM set_config('app.sub_internal', 'off', true);
    SELECT count(*), COALESCE(SUM(haber), 0) INTO v_n, v_sum
      FROM public.vw_cuenta_corriente_movimientos
     WHERE alumno_id = v_alumno AND tipo = 'pago_suscripcion';
    v_out := v_out || jsonb_build_object('t', 4, 'n', 'Pago no-MP sin movimientos: una sola fila derivada de la suscripción',
      'ok', v_n = 1 AND v_sum = 187000
            AND (SELECT fuente_tabla FROM public.vw_cuenta_corriente_movimientos
                  WHERE alumno_id = v_alumno AND tipo = 'pago_suscripcion') = 'suscripciones',
      'd', format('filas=%s total=%s', v_n, v_sum));

    -- ---- TEST 5: sin doble conteo entre MP y la fila derivada ----
    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones SET metodo_pago = 'mercadopago', origen_registro = 'automatico',
           mp_status = 'approved' WHERE id = v_sub;
    PERFORM set_config('app.sub_internal', 'off', true);
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                             currency, direccion, fecha_movimiento, alumno_id, suscripcion_id)
    VALUES (v_cta, 'QA-' || substr(gen_random_uuid()::text, 1, 12), 'payment', 'approved',
            187000, 'ARS', 'ingreso', now(), v_alumno, v_sub);
    SELECT COALESCE(SUM(haber), 0) INTO v_sum
      FROM public.vw_cuenta_corriente_movimientos
     WHERE alumno_id = v_alumno AND tipo = 'pago_suscripcion';
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 5, 'n', 'Sin doble conteo: el haber total es 187.000 y el saldo 0',
      'ok', v_sum = 187000 AND ROUND(v_saldo, 2) = 0,
      'd', format('haber=%s saldo=%s', v_sum, ROUND(v_saldo, 2)));

    v_saldo := (SELECT COALESCE(SUM(saldo), 0) FROM public.get_saldo_alumno(v_alumno));
    v_out := v_out || jsonb_build_object('t', 5, 'n', 'get_saldo_alumno coherente (sin doble conteo legacy)',
      'ok', ROUND(v_saldo, 2) = 0, 'd', 'saldo=' || ROUND(v_saldo, 2));

    v_out := v_out || jsonb_build_object('t', 5, 'n', 'No aparece como deudor',
      'ok', NOT EXISTS (SELECT 1 FROM public.get_deudores_cobranzas() d WHERE d.alumno_id = v_alumno),
      'd', 'deudores ok');

    RAISE EXCEPTION 'ROLLBACK_TESTS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TESTS' THEN
      v_out := v_out || jsonb_build_object('t', 0, 'n', 'ERROR FATAL durante los tests', 'ok', false, 'd', SQLERRM);
    END IF;
  END;

  RETURN QUERY
  SELECT (e->>'t')::int,
         CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,
         e->>'n', e->>'d'
  FROM jsonb_array_elements(v_out) e
  ORDER BY (e->>'t')::int;
END
$fn$;

REVOKE ALL ON FUNCTION public.run_cuenta_corriente_pagos_parciales_tests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_cuenta_corriente_pagos_parciales_tests() TO service_role;
