CREATE OR REPLACE FUNCTION public.run_financial_regression_tests()
RETURNS TABLE(test int, estado text, nombre text, detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_admin uuid;
  v_alumno uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
  v_plan2 uuid := gen_random_uuid();
  v_cta uuid;
  v_sub1 uuid; v_sub2 uuid; v_sub3 uuid; v_mov uuid; v_mov2 uuid;
  v_mp record; v_s record; v_p record;
  v_n int; v_debe int; v_saldo0 numeric; v_saldo1 numeric; v_saldo numeric; v_saldo_pre numeric;
  v_notas0 text; v_notas1 text; v_fallo boolean; v_msg text;
  v_antes numeric; v_desp numeric; v_bad int; v_tot int;
  v_a uuid; v_j jsonb; v_item jsonb; v_k text; v_estado text;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;

  BEGIN
    -- ---------- fixtures ----------
    INSERT INTO public.alumnos (id, nombre, apellido, email, grupo, estado)
    VALUES (v_alumno, 'QA', 'Regresión', 'qa-' || v_alumno || '@test.local', 'Sin grupo', 'activo');

    INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia)
    VALUES (v_plan, 'QA Plan A ' || left(v_plan::text, 8), 10000, 'ARS', true, 'mensual'),
           (v_plan2, 'QA Plan B ' || left(v_plan2::text, 8), 15000, 'ARS', true, 'mensual');

    PERFORM set_config('app.sub_internal', 'on', true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_alumno, v_plan, 'pendiente', 'pendiente', 'cargado_admin', 10000, 10000,
            date_trunc('month', CURRENT_DATE)::date,
            (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date)
    RETURNING id INTO v_sub1;
    PERFORM set_config('app.sub_internal', 'off', true);

    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                             currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-' || substr(gen_random_uuid()::text, 1, 12), 'payment', 'approved',
            10000, 'ARS', 'ingreso', now())
    RETURNING id INTO v_mov;

    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo0
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;

    -- ---------- TEST 1 ----------
    PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub1, 'test');
    SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = v_mov;
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub1;

    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: metodo_pago = mercadopago',
      'ok', v_s.metodo_pago = 'mercadopago', 'd', COALESCE(v_s.metodo_pago, 'null'));
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: mp_status = approved',
      'ok', v_s.mp_status = 'approved', 'd', COALESCE(v_s.mp_status, 'null'));
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: mp_payment_id correcto',
      'ok', v_s.mp_payment_id = v_mp.mp_payment_id, 'd', COALESCE(v_s.mp_payment_id, 'null'));
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: cuenta_mp_id correcta',
      'ok', v_s.cuenta_mp_id = v_mp.cuenta_mp_id, 'd', COALESCE(v_s.cuenta_mp_id::text, 'null'));

    SELECT count(*) INTO v_n FROM public.mp_account_movements
      WHERE suscripcion_id = v_sub1 AND status = 'approved';
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: una sola imputación',
      'ok', v_n = 1, 'd', 'imputaciones=' || v_n);

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: un único HABER',
      'ok', v_n = 1, 'd', 'haberes=' || v_n);

    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo1
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: el saldo baja una sola vez',
      'ok', ROUND(v_saldo0 - v_saldo1, 2) = 10000, 'd', 'delta=' || ROUND(v_saldo0 - v_saldo1, 2));

    -- ---------- TEST 2 (idempotencia) ----------
    SELECT notas INTO v_notas0 FROM public.suscripciones WHERE id = v_sub1;
    PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub1, 'test');
    SELECT notas INTO v_notas1 FROM public.suscripciones WHERE id = v_sub1;

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 2, 'n', 'Asignar dos veces: no duplica HABER',
      'ok', v_n = 1, 'd', 'haberes=' || v_n);
    v_out := v_out || jsonb_build_object('t', 2, 'n', 'Asignar dos veces: no duplica notas',
      'ok', v_notas0 IS NOT DISTINCT FROM v_notas1, 'd', COALESCE(v_notas1, ''));
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 2, 'n', 'Asignar dos veces: el saldo no cambia',
      'ok', ROUND(v_saldo, 2) = ROUND(v_saldo1, 2), 'd', 'saldo=' || ROUND(v_saldo, 2));

    -- ---------- TEST 3 (desasignar) ----------
    PERFORM public.unassign_mp_movement(v_mov);
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub1;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Desasignar: se borra la evidencia MP de la obligación',
      'ok', v_s.mp_payment_id IS NULL AND v_s.mp_status IS NULL AND v_s.metodo_pago = 'pendiente',
      'd', format('mp=%s status=%s metodo=%s', v_s.mp_payment_id, v_s.mp_status, v_s.metodo_pago));

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Desasignar: desaparece el HABER',
      'ok', v_n = 0, 'd', 'haberes=' || v_n);

    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Desasignar: reaparece el saldo pendiente',
      'ok', ROUND(v_saldo, 2) = ROUND(v_saldo0, 2), 'd', 'saldo=' || ROUND(v_saldo, 2));

    -- identificación sin imputar (movimiento aparte, para no contaminar el test 4)
    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                             currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-' || substr(gen_random_uuid()::text, 1, 12), 'payment', 'approved',
            10000, 'ARS', 'ingreso', now())
    RETURNING id INTO v_mov2;

    PERFORM public.assign_mp_movement_to_alumno(v_mov2, v_alumno, 'test');
    SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = v_mov2;
    v_estado := CASE
      WHEN v_mp.suscripcion_id IS NOT NULL OR v_mp.reservation_payment_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.cuenta_ajustes ca WHERE ca.tipo = 'credito'
                    AND ca.referencia_externa = v_mp.mp_payment_id AND ca.aplicado_a_fuente_id IS NOT NULL)
        THEN 'imputado'
      WHEN v_mp.alumno_id IS NOT NULL THEN 'identificado_sin_imputar'
      ELSE 'sin_identificar' END;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Identificar sin imputar: queda IDENTIFICADO · SIN IMPUTAR',
      'ok', v_estado = 'identificado_sin_imputar', 'd', 'estado=' || v_estado);

    -- ---------- TEST 4 (reasignar, aislado) ----------
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo_pre
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub1, 'test');
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub1;
    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 4, 'n', 'Asignar→desasignar→reasignar: estado final idéntico',
      'ok', v_s.metodo_pago = 'mercadopago' AND v_s.mp_status = 'approved' AND v_n = 1
            AND ROUND(v_saldo_pre - v_saldo, 2) = 10000,
      'd', format('metodo=%s haberes=%s delta=%s', v_s.metodo_pago, v_n, ROUND(v_saldo_pre - v_saldo, 2)));

    -- ---------- TEST 5 (doble imputación) ----------
    PERFORM set_config('app.sub_internal', 'on', true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_alumno, v_plan2, 'pendiente', 'pendiente', 'cargado_admin', 15000, 15000,
            (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
            (date_trunc('month', CURRENT_DATE) + interval '2 month - 1 day')::date)
    RETURNING id INTO v_sub2;
    PERFORM set_config('app.sub_internal', 'off', true);

    v_fallo := false; v_msg := '';
    BEGIN
      PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub2, 'test');
    EXCEPTION WHEN OTHERS THEN v_fallo := true; v_msg := SQLERRM;
    END;
    v_out := v_out || jsonb_build_object('t', 5, 'n', 'Imputar el mismo MP a dos obligaciones → falla',
      'ok', v_fallo, 'd', v_msg);

    -- ---------- TEST 6 y 7 (pago informado) ----------
    PERFORM set_config('app.sub_internal', 'on', true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                      precio_base, precio_final, fecha_inicio, fecha_fin, chequeado_admin)
    VALUES (v_alumno, v_plan, 'activa', 'transferencia', 'informado_alumno', 10000, 10000,
            (date_trunc('month', CURRENT_DATE) + interval '2 month')::date,
            (date_trunc('month', CURRENT_DATE) + interval '3 month - 1 day')::date, true)
    RETURNING id INTO v_sub3;
    PERFORM set_config('app.sub_internal', 'off', true);

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub3 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 6, 'n', 'Pago informado APROBADO genera HABER',
      'ok', v_n = 1, 'd', 'haberes=' || v_n);

    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones SET estado = 'pendiente', metodo_pago = 'pendiente',
           chequeado_admin = false, mp_status = NULL, mp_payment_id = NULL WHERE id = v_sub3;
    PERFORM set_config('app.sub_internal', 'off', true);

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub3 AND tipo = 'pago_suscripcion' AND haber > 0;
    SELECT count(*) INTO v_debe FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub3 AND tipo = 'cargo_suscripcion' AND debe > 0;
    v_out := v_out || jsonb_build_object('t', 7, 'n', 'Pago informado RECHAZADO no genera HABER',
      'ok', v_n = 0, 'd', 'haberes=' || v_n);
    v_out := v_out || jsonb_build_object('t', 7, 'n', 'Pago informado RECHAZADO mantiene la deuda',
      'ok', v_debe = 1, 'd', 'cargos=' || v_debe);

    -- ---------- TEST 8 (cambio de plan) ----------
    PERFORM public.cambiar_plan_suscripcion(v_sub2, v_plan, 'test de regresión', true, NULL, NULL);
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub2;
    SELECT * INTO v_p FROM public.planes WHERE id = v_s.plan_id;
    v_out := v_out || jsonb_build_object('t', 8, 'n', 'Cambio de plan: plan_id actualizado',
      'ok', v_s.plan_id = v_plan, 'd', v_s.plan_id::text);
    v_out := v_out || jsonb_build_object('t', 8, 'n', 'Cambio de plan: precio alineado al plan nuevo',
      'ok', COALESCE(v_s.precio_final, v_s.precio_base) = v_p.precio,
      'd', format('sub=%s plan=%s', COALESCE(v_s.precio_final, v_s.precio_base), v_p.precio));
    v_out := v_out || jsonb_build_object('t', 8, 'n', 'Cambio de plan: moneda coherente en la cuenta corriente',
      'ok', (SELECT moneda FROM public.vw_cuenta_corriente_movimientos
              WHERE fuente_id = v_sub2 AND tipo = 'cargo_suscripcion') = COALESCE(v_p.moneda, 'ARS'),
      'd', format('plan=%s', v_p.moneda));

    -- ---------- TEST 9 ----------
    SELECT debe INTO v_antes FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'cargo_suscripcion';
    UPDATE public.planes SET precio = precio + 7777 WHERE id = v_plan;
    SELECT debe INTO v_desp FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'cargo_suscripcion';
    v_out := v_out || jsonb_build_object('t', 9, 'n', 'Subir planes.precio no modifica el cargo histórico',
      'ok', v_antes = v_desp, 'd', format('antes=%s despues=%s', v_antes, v_desp));

    -- ---------- TEST 10 ----------
    v_bad := 0; v_tot := 0;
    FOR v_a IN
      SELECT v_alumno
      UNION ALL
      SELECT DISTINCT alumno_id FROM public.mp_account_movements
       WHERE alumno_id IS NOT NULL LIMIT 40
    LOOP
      v_j := public.get_alumno_payment_targets(v_a);
      FOREACH v_k IN ARRAY ARRAY['reservations', 'subscriptions', 'cargos'] LOOP
        FOR v_item IN SELECT jsonb_array_elements(COALESCE(v_j -> v_k, '[]'::jsonb)) LOOP
          v_tot := v_tot + 1;
          IF COALESCE((v_item ->> 'balance')::numeric, 0) <= 0.01 THEN v_bad := v_bad + 1; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
    v_out := v_out || jsonb_build_object('t', 10, 'n', 'get_alumno_payment_targets no devuelve obligaciones saldadas',
      'ok', v_bad = 0, 'd', format('revisadas=%s con balance<=0.01=%s', v_tot, v_bad));

    -- ---------- TEST 11 (identificar y luego imputar no duplica crédito) ----------
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo_pre
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    PERFORM public.assign_mp_movement_to_target(v_mov2, v_alumno, 'suscripcion', v_sub3, 'test');
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 11,
      'n', 'Identificar y después imputar no duplica el crédito en la cuenta corriente',
      'ok', ROUND(v_saldo_pre - v_saldo, 2) = 10000,
      'd', format('delta=%s (esperado 10000)', ROUND(v_saldo_pre - v_saldo, 2)));

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
END $fn$;