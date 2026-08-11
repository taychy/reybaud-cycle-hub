-- ============================================================
-- Reybaud · Tests de regresión del circuito financiero (Fase 1.5)
-- ============================================================
-- Ejecutar con:  ./scripts/run-financial-tests.sh
-- (o)            psql -v ON_ERROR_STOP=1 -f supabase/tests/financial_regression.sql
--
-- TODO el script corre dentro de una transacción que termina en ROLLBACK:
-- no deja datos ni modifica nada en la base. Es re-ejecutable tantas veces
-- como haga falta, en particular después de cada migración.
-- ============================================================

\set ON_ERROR_STOP on
\timing off
BEGIN;

-- ---------- infraestructura de test ----------
CREATE TEMP TABLE _res(n int, nombre text, ok boolean, detalle text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.chk(_n int, _nombre text, _ok boolean, _detalle text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO _res VALUES (_n, _nombre, _ok, _detalle);
$$;

-- Contexto de admin para las RPC (has_role/auth.uid)
DO $$
DECLARE v_admin uuid;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'no hay usuario admin para correr los tests'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, false);
END $$;

-- ---------- fixtures ----------
DO $$
DECLARE
  v_alumno uuid := gen_random_uuid();
  v_plan   uuid := gen_random_uuid();
  v_plan2  uuid := gen_random_uuid();
  v_cta    uuid;
BEGIN
  SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;
  PERFORM set_config('test.alumno', v_alumno::text, false);
  PERFORM set_config('test.plan', v_plan::text, false);
  PERFORM set_config('test.plan2', v_plan2::text, false);
  PERFORM set_config('test.cuenta_mp', v_cta::text, false);

  INSERT INTO public.alumnos (id, nombre, apellido, email, grupo, estado)
  VALUES (v_alumno, 'QA', 'Regresión', 'qa-regresion-' || v_alumno || '@test.local', 'Sin grupo', 'activo');

  INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia)
  VALUES (v_plan, 'QA Plan A ' || left(v_plan::text, 8), 10000, 'ARS', true, 'mensual'),
         (v_plan2, 'QA Plan B ' || left(v_plan2::text, 8), 15000, 'ARS', true, 'mensual');
END $$;

-- helper: crea una suscripción pendiente del alumno de test
CREATE OR REPLACE FUNCTION pg_temp.nueva_sub(_plan uuid, _precio numeric, _inicio date)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM set_config('app.sub_internal', 'on', true);
  INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                    precio_base, precio_final, fecha_inicio, fecha_fin)
  VALUES (current_setting('test.alumno')::uuid, _plan, 'pendiente', 'pendiente', 'cargado_admin',
          _precio, _precio, _inicio, (_inicio + interval '1 month - 1 day')::date)
  RETURNING id INTO v_id;
  PERFORM set_config('app.sub_internal', 'off', true);
  RETURN v_id;
END $$;

-- helper: crea un movimiento MP aprobado
CREATE OR REPLACE FUNCTION pg_temp.nuevo_mp(_amount numeric)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                           currency, direccion, fecha_movimiento)
  VALUES (current_setting('test.cuenta_mp')::uuid, 'QA-' || substr(gen_random_uuid()::text, 1, 12),
          'payment', 'approved', _amount, 'ARS', 'ingreso', now())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- helper: total HABER del alumno de test en la cuenta corriente
CREATE OR REPLACE FUNCTION pg_temp.haber_total()
RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(SUM(haber), 0) FROM public.vw_cuenta_corriente_movimientos
  WHERE alumno_id = current_setting('test.alumno')::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.saldo_total()
RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(SUM(debe - haber), 0) FROM public.vw_cuenta_corriente_movimientos
  WHERE alumno_id = current_setting('test.alumno')::uuid;
$$;

-- ============================================================
-- TEST 1 · Asignar un movimiento MP a una suscripción
-- ============================================================
DO $$
DECLARE
  v_sub uuid; v_mov uuid; v_mp record; v_s record;
  v_haber numeric; v_saldo_antes numeric; v_saldo_desp numeric; v_n int;
BEGIN
  v_sub := pg_temp.nueva_sub(current_setting('test.plan')::uuid, 10000, date_trunc('month', CURRENT_DATE)::date);
  v_mov := pg_temp.nuevo_mp(10000);
  v_saldo_antes := pg_temp.saldo_total();

  PERFORM public.assign_mp_movement_to_target(
    v_mov, current_setting('test.alumno')::uuid, 'suscripcion', v_sub, 'test');

  SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = v_mov;
  SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub;

  PERFORM pg_temp.chk(1, 'Asignar MP→suscripción: metodo_pago = mercadopago',
    v_s.metodo_pago = 'mercadopago', 'metodo_pago=' || COALESCE(v_s.metodo_pago, 'null'));
  PERFORM pg_temp.chk(1, 'Asignar MP→suscripción: mp_status = approved',
    v_s.mp_status = 'approved', 'mp_status=' || COALESCE(v_s.mp_status, 'null'));
  PERFORM pg_temp.chk(1, 'Asignar MP→suscripción: mp_payment_id correcto',
    v_s.mp_payment_id = v_mp.mp_payment_id, COALESCE(v_s.mp_payment_id, 'null'));
  PERFORM pg_temp.chk(1, 'Asignar MP→suscripción: cuenta_mp_id correcta',
    v_s.cuenta_mp_id = v_mp.cuenta_mp_id, COALESCE(v_s.cuenta_mp_id::text, 'null'));

  SELECT count(*) INTO v_n FROM public.mp_account_movements
   WHERE suscripcion_id = v_sub AND status = 'approved';
  PERFORM pg_temp.chk(1, 'Asignar MP→suscripción: una sola imputación', v_n = 1, 'imputaciones=' || v_n);

  SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'pago_suscripcion' AND haber > 0;
  PERFORM pg_temp.chk(1, 'Asignar MP→suscripción: un único HABER', v_n = 1, 'haberes=' || v_n);

  v_saldo_desp := pg_temp.saldo_total();
  PERFORM pg_temp.chk(1, 'Asignar MP→suscripción: el saldo baja exactamente una vez',
    ROUND(v_saldo_antes - v_saldo_desp, 2) = 10000, 'delta=' || ROUND(v_saldo_antes - v_saldo_desp, 2));

  PERFORM set_config('test.sub1', v_sub::text, false);
  PERFORM set_config('test.mov1', v_mov::text, false);
  PERFORM set_config('test.saldo1', v_saldo_desp::text, false);
END $$;

-- ============================================================
-- TEST 2 · Idempotencia: asignar dos veces
-- ============================================================
DO $$
DECLARE
  v_sub uuid := current_setting('test.sub1')::uuid;
  v_mov uuid := current_setting('test.mov1')::uuid;
  v_notas_antes text; v_notas_desp text; v_n int; v_saldo numeric;
BEGIN
  SELECT notas INTO v_notas_antes FROM public.suscripciones WHERE id = v_sub;

  PERFORM public.assign_mp_movement_to_target(
    v_mov, current_setting('test.alumno')::uuid, 'suscripcion', v_sub, 'test');

  SELECT notas INTO v_notas_desp FROM public.suscripciones WHERE id = v_sub;

  SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'pago_suscripcion' AND haber > 0;
  PERFORM pg_temp.chk(2, 'Reasignación repetida: no duplica HABER', v_n = 1, 'haberes=' || v_n);
  PERFORM pg_temp.chk(2, 'Reasignación repetida: no duplica notas',
    v_notas_antes IS NOT DISTINCT FROM v_notas_desp, COALESCE(v_notas_desp, ''));

  v_saldo := pg_temp.saldo_total();
  PERFORM pg_temp.chk(2, 'Reasignación repetida: el saldo no cambia',
    ROUND(v_saldo, 2) = ROUND(current_setting('test.saldo1')::numeric, 2),
    'saldo=' || ROUND(v_saldo, 2));
END $$;

-- ============================================================
-- TEST 3 · Asignar → desasignar
-- ============================================================
DO $$
DECLARE
  v_sub uuid := current_setting('test.sub1')::uuid;
  v_mov uuid := current_setting('test.mov1')::uuid;
  v_s record; v_mp record; v_n int; v_saldo numeric; v_estado text;
BEGIN
  PERFORM public.unassign_mp_movement(v_mov);

  SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub;
  SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = v_mov;

  PERFORM pg_temp.chk(3, 'Desasignar: desaparece la evidencia MP de la obligación',
    v_s.mp_payment_id IS NULL AND v_s.mp_status IS NULL AND v_s.metodo_pago = 'pendiente',
    format('mp_payment_id=%s mp_status=%s metodo=%s', v_s.mp_payment_id, v_s.mp_status, v_s.metodo_pago));

  SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'pago_suscripcion' AND haber > 0;
  PERFORM pg_temp.chk(3, 'Desasignar: reaparece el saldo pendiente (sin HABER)', v_n = 0, 'haberes=' || v_n);

  v_saldo := pg_temp.saldo_total();
  PERFORM pg_temp.chk(3, 'Desasignar: el saldo vuelve al valor original',
    ROUND(v_saldo, 2) = ROUND(current_setting('test.saldo1')::numeric + 10000, 2),
    'saldo=' || ROUND(v_saldo, 2));

  -- Reidentificar sin imputar (el alumno se conserva, no hay obligación)
  PERFORM public.assign_mp_movement_to_alumno(v_mov, current_setting('test.alumno')::uuid, 'test');
  SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = v_mov;
  v_estado := CASE
    WHEN v_mp.suscripcion_id IS NOT NULL OR v_mp.reservation_payment_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.cuenta_ajustes ca
                  WHERE ca.referencia_externa = v_mp.mp_payment_id AND ca.tipo = 'credito'
                    AND ca.aplicado_a_fuente_id IS NOT NULL) THEN 'imputado'
    WHEN v_mp.alumno_id IS NOT NULL THEN 'identificado_sin_imputar'
    ELSE 'sin_identificar' END;
  PERFORM pg_temp.chk(3, 'Desasignar: el movimiento queda IDENTIFICADO · SIN IMPUTAR',
    v_estado = 'identificado_sin_imputar', 'estado=' || v_estado);
END $$;

-- ============================================================
-- TEST 4 · Asignar → desasignar → reasignar (idempotencia total)
-- ============================================================
DO $$
DECLARE
  v_sub uuid := current_setting('test.sub1')::uuid;
  v_mov uuid := current_setting('test.mov1')::uuid;
  v_s record; v_n int; v_saldo numeric;
BEGIN
  PERFORM public.assign_mp_movement_to_target(
    v_mov, current_setting('test.alumno')::uuid, 'suscripcion', v_sub, 'test');

  SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub;
  SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'pago_suscripcion' AND haber > 0;
  v_saldo := pg_temp.saldo_total();

  PERFORM pg_temp.chk(4, 'Ciclo asignar/desasignar/reasignar: estado final idéntico',
    v_s.metodo_pago = 'mercadopago' AND v_s.mp_status = 'approved' AND v_n = 1
      AND ROUND(v_saldo, 2) = ROUND(current_setting('test.saldo1')::numeric, 2),
    format('metodo=%s haberes=%s saldo=%s', v_s.metodo_pago, v_n, ROUND(v_saldo, 2)));
END $$;

-- ============================================================
-- TEST 5 · Doble imputación incompatible → debe fallar
-- ============================================================
DO $$
DECLARE
  v_mov uuid := current_setting('test.mov1')::uuid;
  v_sub2 uuid;
  v_fallo boolean := false;
  v_msg text := '';
BEGIN
  v_sub2 := pg_temp.nueva_sub(current_setting('test.plan2')::uuid, 15000,
                              (date_trunc('month', CURRENT_DATE) + interval '1 month')::date);
  BEGIN
    PERFORM public.assign_mp_movement_to_target(
      v_mov, current_setting('test.alumno')::uuid, 'suscripcion', v_sub2, 'test');
  EXCEPTION WHEN OTHERS THEN
    v_fallo := true; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.chk(5, 'Imputar el mismo MP a dos obligaciones distintas → falla', v_fallo, v_msg);
  PERFORM set_config('test.sub2', v_sub2::text, false);
END $$;

-- ============================================================
-- TEST 6 y 7 · Pago informado por el alumno (aprobado / rechazado)
-- ============================================================
DO $$
DECLARE v_sub uuid; v_n int; v_debe int;
BEGIN
  -- 6) informado + aprobado por admin → genera HABER
  v_sub := pg_temp.nueva_sub(current_setting('test.plan')::uuid, 10000,
                             (date_trunc('month', CURRENT_DATE) + interval '2 month')::date);
  PERFORM set_config('app.sub_internal', 'on', true);
  UPDATE public.suscripciones SET estado = 'activa', metodo_pago = 'transferencia',
         origen_registro = 'informado_alumno', chequeado_admin = true WHERE id = v_sub;
  PERFORM set_config('app.sub_internal', 'off', true);

  SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'pago_suscripcion' AND haber > 0;
  PERFORM pg_temp.chk(6, 'Pago informado APROBADO genera HABER', v_n = 1, 'haberes=' || v_n);

  -- 7) informado + rechazado → sin HABER pero la obligación sigue viva
  PERFORM set_config('app.sub_internal', 'on', true);
  UPDATE public.suscripciones SET estado = 'pendiente', metodo_pago = 'pendiente',
         chequeado_admin = false, mp_status = NULL, mp_payment_id = NULL WHERE id = v_sub;
  PERFORM set_config('app.sub_internal', 'off', true);

  SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'pago_suscripcion' AND haber > 0;
  SELECT count(*) INTO v_debe FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'cargo_suscripcion' AND debe > 0;
  PERFORM pg_temp.chk(7, 'Pago informado RECHAZADO no genera HABER', v_n = 0, 'haberes=' || v_n);
  PERFORM pg_temp.chk(7, 'Pago informado RECHAZADO mantiene la deuda', v_debe = 1, 'cargos=' || v_debe);
END $$;

-- ============================================================
-- TEST 8 · Cambio de plan: plan / precio / moneda coherentes
-- ============================================================
DO $$
DECLARE v_sub uuid := current_setting('test.sub2')::uuid; v_s record; v_p record;
BEGIN
  PERFORM public.cambiar_plan_suscripcion(
    v_sub, current_setting('test.plan')::uuid, 'test de regresión', true, NULL, NULL);
  SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub;
  SELECT * INTO v_p FROM public.planes WHERE id = v_s.plan_id;

  PERFORM pg_temp.chk(8, 'Cambio de plan: plan_id actualizado',
    v_s.plan_id = current_setting('test.plan')::uuid, v_s.plan_id::text);
  PERFORM pg_temp.chk(8, 'Cambio de plan: precio alineado al plan nuevo',
    COALESCE(v_s.precio_final, v_s.precio_base) = v_p.precio,
    format('sub=%s plan=%s', COALESCE(v_s.precio_final, v_s.precio_base), v_p.precio));
  PERFORM pg_temp.chk(8, 'Cambio de plan: moneda coherente en la cuenta corriente',
    (SELECT moneda FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub AND tipo = 'cargo_suscripcion') = COALESCE(v_p.moneda, 'ARS'),
    format('plan=%s', v_p.moneda));
END $$;

-- ============================================================
-- TEST 9 · Cambiar planes.precio no altera el cargo histórico
-- ============================================================
DO $$
DECLARE v_sub uuid := current_setting('test.sub1')::uuid; v_antes numeric; v_desp numeric;
BEGIN
  SELECT debe INTO v_antes FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'cargo_suscripcion';
  UPDATE public.planes SET precio = precio + 7777 WHERE id = current_setting('test.plan')::uuid;
  SELECT debe INTO v_desp FROM public.vw_cuenta_corriente_movimientos
   WHERE fuente_id = v_sub AND tipo = 'cargo_suscripcion';

  PERFORM pg_temp.chk(9, 'Subir el precio del plan no modifica el cargo histórico',
    v_antes = v_desp, format('antes=%s despues=%s', v_antes, v_desp));
END $$;

-- ============================================================
-- TEST 10 · get_alumno_payment_targets nunca devuelve balance <= 0.01
-- ============================================================
DO $$
DECLARE
  v_a uuid; v_j jsonb; v_bad int := 0; v_tot int := 0; v_item jsonb; v_k text;
BEGIN
  FOR v_a IN
    SELECT current_setting('test.alumno')::uuid
    UNION ALL
    SELECT DISTINCT alumno_id FROM public.mp_account_movements
     WHERE alumno_id IS NOT NULL ORDER BY 1 LIMIT 40
  LOOP
    v_j := public.get_alumno_payment_targets(v_a);
    FOREACH v_k IN ARRAY ARRAY['reservations', 'subscriptions', 'cargos'] LOOP
      FOR v_item IN SELECT jsonb_array_elements(COALESCE(v_j -> v_k, '[]'::jsonb)) LOOP
        v_tot := v_tot + 1;
        IF COALESCE((v_item ->> 'balance')::numeric, 0) <= 0.01 THEN v_bad := v_bad + 1; END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  PERFORM pg_temp.chk(10, 'get_alumno_payment_targets no devuelve obligaciones saldadas',
    v_bad = 0, format('revisadas=%s con balance<=0.01=%s', v_tot, v_bad));
END $$;

-- ---------- resultado ----------
\echo ''
\echo '================ RESULTADO DE TESTS ================'
SELECT n AS test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS estado, nombre, detalle
FROM _res ORDER BY n, nombre;

SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail, count(*) AS total
FROM _res;

DO $$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM _res WHERE NOT ok;
  IF v_fail > 0 THEN RAISE WARNING '% test(s) FALLARON', v_fail; END IF;
END $$;

ROLLBACK;
