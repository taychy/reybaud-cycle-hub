
CREATE OR REPLACE FUNCTION public.run_imputaciones_regression_tests()
RETURNS TABLE (test integer, estado text, nombre text, detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_cta uuid;
  v_al uuid := gen_random_uuid();
  v_al2 uuid := gen_random_uuid();
  v_al3 uuid := gen_random_uuid();
  v_ev uuid := gen_random_uuid();
  v_res uuid;
  v_sub uuid[] := ARRAY[]::uuid[];
  v_montos numeric[] := ARRAY[10000,20000,5000,5000,10000,80000,20000,10000,49868,54000,71240,71240];
  v_duenos uuid[];
  v_plan uuid; v_new uuid; i int;
  v_ma uuid; v_mb uuid; v_mc uuid; v_me uuid; v_mf uuid; v_mg uuid; v_mh uuid; v_mfam uuid;
  v_i1 uuid; v_i2 uuid;
  v_ok boolean; v_n int; v_x numeric; v_y numeric; v_err text;
  v_mpid text := 'QA-FAM-' || substr(gen_random_uuid()::text, 1, 8);
BEGIN
  SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;
  v_duenos := ARRAY[v_al,v_al,v_al,v_al,v_al,v_al,v_al,v_al,v_al2,v_al3,v_al3,v_al];

  BEGIN
    INSERT INTO public.alumnos (id, nombre, apellido, email, grupo, estado) VALUES
      (v_al,  'QA', 'Imputa',  'qa-' || v_al  || '@test.local', 'Sin grupo', 'activo'),
      (v_al2, 'QA', 'Hijo1',   'qa-' || v_al2 || '@test.local', 'Sin grupo', 'activo'),
      (v_al3, 'QA', 'Hijo2',   'qa-' || v_al3 || '@test.local', 'Sin grupo', 'activo');

    PERFORM set_config('app.sub_internal', 'on', true);
    FOR i IN 1..array_length(v_montos, 1) LOOP
      v_plan := gen_random_uuid();
      INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia)
      VALUES (v_plan, 'QA Imput ' || left(v_plan::text, 8), v_montos[i], 'ARS', true, 'mensual');

      INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                        precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (v_duenos[i], v_plan, 'pendiente', 'pendiente', 'cargado_admin',
              v_montos[i], v_montos[i],
              date_trunc('month', CURRENT_DATE)::date,
              (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date)
      RETURNING id INTO v_new;
      v_sub := v_sub || v_new;
    END LOOP;
    PERFORM set_config('app.sub_internal', 'off', true);

    INSERT INTO public.events (id, title, date) VALUES (v_ev, 'QA Camp ' || left(v_ev::text, 8), CURRENT_DATE + 30);
    INSERT INTO public.event_reservations (event_id, alumno_id, amount_total, amount_paid, balance_due, moneda)
    VALUES (v_ev, v_al, 30000, 0, 30000, 'ARS') RETURNING id INTO v_res;

    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-A-' || substr(gen_random_uuid()::text,1,8), 'payment', 'approved', 10000, 'ARS', 'ingreso', now()) RETURNING id INTO v_ma;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-B-' || substr(gen_random_uuid()::text,1,8), 'payment', 'approved', 30000, 'ARS', 'ingreso', now()) RETURNING id INTO v_mb;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-C-' || substr(gen_random_uuid()::text,1,8), 'payment', 'approved', 100000, 'ARS', 'ingreso', now()) RETURNING id INTO v_mc;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-E-' || substr(gen_random_uuid()::text,1,8), 'payment', 'approved', 3000, 'ARS', 'ingreso', now()) RETURNING id INTO v_me;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-F-' || substr(gen_random_uuid()::text,1,8), 'payment', 'approved', 2000, 'ARS', 'ingreso', now()) RETURNING id INTO v_mf;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-G-' || substr(gen_random_uuid()::text,1,8), 'payment', 'approved', 4000, 'ARS', 'ingreso', now()) RETURNING id INTO v_mg;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-H-' || substr(gen_random_uuid()::text,1,8), 'payment', 'approved', 40000, 'ARS', 'ingreso', now()) RETURNING id INTO v_mh;
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount, currency, direccion, fecha_movimiento)
    VALUES (v_cta, v_mpid, 'payment', 'approved', 246348, 'ARS', 'ingreso', now()) RETURNING id INTO v_mfam;

    ---------------- TEST 1 ----------------
    v_i1 := public.imputar_pago('mp_movement', v_ma, 'suscripcion', v_sub[1], v_al, 10000, 'ARS');
    v_out := v_out || jsonb_build_object('t',1,'n','Pago 1 → obligación 1: saldo obligación 0 y pago consumido',
      'ok', public.obligacion_saldo('suscripcion', v_sub[1]) = 0 AND public.pago_saldo_disponible('mp_movement', v_ma) = 0,
      'd', format('saldo_oblig=%s disponible=%s', public.obligacion_saldo('suscripcion', v_sub[1]), public.pago_saldo_disponible('mp_movement', v_ma)));

    ---------------- TEST 2 ----------------
    PERFORM public.imputar_pago('mp_movement', v_mb, 'suscripcion', v_sub[2], v_al, 20000, 'ARS');
    PERFORM public.imputar_pago('mp_movement', v_mb, 'suscripcion', v_sub[3], v_al, 5000, 'ARS');
    v_out := v_out || jsonb_build_object('t',2,'n','Un pago repartido en varias obligaciones deja saldo disponible',
      'ok', public.pago_saldo_disponible('mp_movement', v_mb) = 5000
            AND public.obligacion_saldo('suscripcion', v_sub[2]) = 0
            AND public.obligacion_saldo('suscripcion', v_sub[3]) = 0,
      'd', format('disponible=%s', public.pago_saldo_disponible('mp_movement', v_mb)));

    ---------------- TEST 3 ----------------
    PERFORM public.imputar_pago('mp_movement', v_me, 'suscripcion', v_sub[4], v_al, 3000, 'ARS');
    PERFORM public.imputar_pago('mp_movement', v_mf, 'suscripcion', v_sub[4], v_al, 2000, 'ARS');
    v_out := v_out || jsonb_build_object('t',3,'n','Varios pagos sobre la misma obligación la saldan',
      'ok', public.obligacion_saldo('suscripcion', v_sub[4]) = 0 AND public.obligacion_imputado('suscripcion', v_sub[4]) = 5000,
      'd', format('imputado=%s', public.obligacion_imputado('suscripcion', v_sub[4])));

    ---------------- TEST 4 ----------------
    PERFORM public.imputar_pago('mp_movement', v_mg, 'suscripcion', v_sub[5], v_al, 4000, 'ARS');
    v_out := v_out || jsonb_build_object('t',4,'n','Pago parcial: la obligación conserva el saldo remanente',
      'ok', public.obligacion_saldo('suscripcion', v_sub[5]) = 6000,
      'd', format('saldo=%s (esperado 6000)', public.obligacion_saldo('suscripcion', v_sub[5])));

    ---------------- TEST 5 ----------------
    PERFORM public.imputar_pago('mp_movement', v_mc, 'suscripcion', v_sub[6], v_al, 80000, 'ARS');
    v_out := v_out || jsonb_build_object('t',5,'n','Pago excedente: queda saldo a favor disponible en el mismo pago',
      'ok', public.pago_saldo_disponible('mp_movement', v_mc) = 20000 AND public.obligacion_saldo('suscripcion', v_sub[6]) = 0,
      'd', format('disponible=%s (esperado 20000)', public.pago_saldo_disponible('mp_movement', v_mc)));

    ---------------- TEST 6 ----------------
    PERFORM public.imputar_pago('mp_movement', v_mc, 'suscripcion', v_sub[7], v_al, 20000, 'ARS');
    SELECT count(*) INTO v_n FROM public.cuenta_ajustes WHERE alumno_id = v_al AND tipo = 'credito';
    v_out := v_out || jsonb_build_object('t',6,'n','Saldo a favor reutilizado sin crear un ingreso ficticio',
      'ok', public.pago_saldo_disponible('mp_movement', v_mc) = 0 AND public.obligacion_saldo('suscripcion', v_sub[7]) = 0 AND v_n = 0,
      'd', format('disponible=%s ajustes_credito_creados=%s', public.pago_saldo_disponible('mp_movement', v_mc), v_n));

    ---------------- TEST 7 ----------------
    PERFORM public.imputar_pago('mp_movement', v_mfam, 'suscripcion', v_sub[9],  v_al2, 49868, 'ARS');
    PERFORM public.imputar_pago('mp_movement', v_mfam, 'suscripcion', v_sub[10], v_al3, 54000, 'ARS');
    PERFORM public.imputar_pago('mp_movement', v_mfam, 'suscripcion', v_sub[11], v_al3, 71240, 'ARS');
    PERFORM public.imputar_pago('mp_movement', v_mfam, 'suscripcion', v_sub[12], v_al,  71240, 'ARS');
    SELECT count(*) INTO v_n FROM public.suscripciones WHERE mp_payment_id = v_mpid;
    v_out := v_out || jsonb_build_object('t',7,'n','Pago familiar: un solo ingreso, 4 imputaciones, sin duplicar el crédito',
      'ok', public.pago_saldo_disponible('mp_movement', v_mfam) = 0
            AND public.obligacion_saldo('suscripcion', v_sub[9]) = 0
            AND public.obligacion_saldo('suscripcion', v_sub[11]) = 0
            AND v_n = 0,
      'd', format('disponible=%s suscripciones_con_mp_payment_id=%s', public.pago_saldo_disponible('mp_movement', v_mfam), v_n));

    ---------------- TEST 8 ----------------
    PERFORM public.imputar_pago('mp_movement', v_mh, 'reserva', v_res, v_al, 30000, 'ARS');
    PERFORM public.imputar_pago('mp_movement', v_mh, 'suscripcion', v_sub[8], v_al, 10000, 'ARS');
    v_out := v_out || jsonb_build_object('t',8,'n','Un pago cubre evento + mensualidad',
      'ok', public.obligacion_saldo('reserva', v_res) = 0 AND public.obligacion_saldo('suscripcion', v_sub[8]) = 0
            AND public.pago_saldo_disponible('mp_movement', v_mh) = 0,
      'd', format('reserva=%s sub=%s', public.obligacion_saldo('reserva', v_res), public.obligacion_saldo('suscripcion', v_sub[8])));

    ---------------- TEST 9 ----------------
    v_ok := false; v_err := '';
    BEGIN
      PERFORM public.imputar_pago('mp_movement', v_ma, 'suscripcion', v_sub[5], v_al, 1000, 'ARS');
    EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM;
    END;
    v_out := v_out || jsonb_build_object('t',9,'n','Intentar sobreimputar un pago agotado falla',
      'ok', v_ok, 'd', COALESCE(NULLIF(v_err,''), 'no falló (mal)'));

    ---------------- TEST 10 ----------------
    PERFORM public.anular_imputacion(v_i1, 'test');
    v_out := v_out || jsonb_build_object('t',10,'n','Anular imputación devuelve el saldo y libera el pago',
      'ok', public.obligacion_saldo('suscripcion', v_sub[1]) = 10000 AND public.pago_saldo_disponible('mp_movement', v_ma) = 10000,
      'd', format('saldo=%s disponible=%s', public.obligacion_saldo('suscripcion', v_sub[1]), public.pago_saldo_disponible('mp_movement', v_ma)));

    ---------------- TEST 11 ----------------
    v_i2 := public.imputar_pago('mp_movement', v_ma, 'suscripcion', v_sub[1], v_al, 10000, 'ARS');
    SELECT count(*) INTO v_n FROM public.pagos_imputaciones WHERE pago_origen_id = v_ma AND anulado_at IS NULL;
    v_out := v_out || jsonb_build_object('t',11,'n','Anular y reimputar deja el mismo estado final',
      'ok', public.obligacion_saldo('suscripcion', v_sub[1]) = 0 AND public.pago_saldo_disponible('mp_movement', v_ma) = 0 AND v_n = 1,
      'd', format('activas=%s', v_n));

    ---------------- TEST 12 ----------------
    v_i1 := public.imputar_pago('mp_movement', v_ma, 'suscripcion', v_sub[1], v_al, 10000, 'ARS');
    SELECT count(*) INTO v_n FROM public.pagos_imputaciones
      WHERE pago_origen_id = v_ma AND obligacion_id = v_sub[1] AND anulado_at IS NULL;
    v_out := v_out || jsonb_build_object('t',12,'n','Ejecutar dos veces la misma imputación no duplica nada',
      'ok', v_i1 = v_i2 AND v_n = 1 AND public.obligacion_saldo('suscripcion', v_sub[1]) = 0,
      'd', format('filas_activas=%s mismo_id=%s', v_n, v_i1 = v_i2));

    ---------------- TEST 13 ----------------
    v_ok := false; v_err := '';
    BEGIN
      PERFORM public.imputar_pago('mp_movement', v_ma, 'suscripcion', v_sub[5], v_al, 10000, 'ARS');
    EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM;
    END;
    v_out := v_out || jsonb_build_object('t',13,'n','Un pago ya consumido no puede aplicarse a otra obligación',
      'ok', v_ok, 'd', COALESCE(NULLIF(v_err,''), 'no falló (mal)'));

    ---------------- TEST 14 ----------------
    SELECT count(*) INTO v_n
      FROM (SELECT pago_origen_tipo t, pago_origen_id i, SUM(monto) s
              FROM public.pagos_imputaciones WHERE anulado_at IS NULL GROUP BY 1,2) q
     WHERE q.s > COALESCE(public.pago_monto_bruto(q.t, q.i), q.s) + 0.01;
    v_out := v_out || jsonb_build_object('t',14,'n','La suma de imputaciones nunca supera el monto del pago',
      'ok', v_n = 0, 'd', format('pagos_sobreimputados=%s', v_n));

    ---------------- TEST 15 ----------------
    v_x := public.obligacion_monto('suscripcion', v_sub[5]) - public.obligacion_imputado('suscripcion', v_sub[5]);
    v_out := v_out || jsonb_build_object('t',15,'n','Saldo de obligación = importe - imputaciones activas',
      'ok', v_x = public.obligacion_saldo('suscripcion', v_sub[5]), 'd', format('%s', v_x));

    ---------------- TEST 16 ----------------
    v_y := public.pago_monto_bruto('mp_movement', v_mb) - public.pago_monto_imputado('mp_movement', v_mb);
    v_out := v_out || jsonb_build_object('t',16,'n','Saldo disponible del pago = ingreso - imputaciones activas',
      'ok', v_y = public.pago_saldo_disponible('mp_movement', v_mb), 'd', format('%s', v_y));

    ---------------- TEST 17 ----------------
    SELECT COALESCE(saldo_legacy,0), COALESCE(saldo_nuevo,0) INTO v_x, v_y
      FROM public.vw_saldo_comparacion WHERE alumno_id = v_al AND moneda = 'ARS';
    v_out := v_out || jsonb_build_object('t',17,'n','Comparación legacy vs modelo nuevo disponible por alumno',
      'ok', v_y IS NOT NULL, 'd', format('saldo_legacy=%s saldo_nuevo=%s diferencia=%s',
        COALESCE(v_x,0), COALESCE(v_y,0), COALESCE(v_y,0) - COALESCE(v_x,0)));

    RAISE EXCEPTION 'ROLLBACK_TESTS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TESTS' THEN
      v_out := v_out || jsonb_build_object('t', 0, 'n', 'ERROR FATAL durante los tests de imputaciones', 'ok', false, 'd', SQLERRM);
    END IF;
  END;

  RETURN QUERY
  SELECT (e->>'t')::int,
         CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,
         e->>'n', e->>'d'
  FROM jsonb_array_elements(v_out) e
  ORDER BY (e->>'t')::int;
END;
$fn$;
