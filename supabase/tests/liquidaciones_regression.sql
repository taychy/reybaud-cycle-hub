-- ============================================================
-- Reybaud · Tests de regresión de Liquidaciones
-- ============================================================
-- Crea datos de prueba, valida el circuito y REVIERTE todo
-- (el bloque termina con RAISE EXCEPTION 'LIQ_TESTS_DONE ...').
--
-- Cobertura:
--   1 confirmar_clase_grupal dos veces → 1 clase, 1 movimiento
--   2 honorario configurado → total = valor * % de la regla, liquidable
--   3 agenda sin honorario → pendiente_revision, total 0, observación
--   4 tipo sin regla → pendiente_revision
--   5 turnera realizada dos veces → 1 solo movimiento
--   6 turnera sin honorario de servicio → pendiente_revision total 0
--   7 carga manual siempre pendiente_revision (aun con honorario)
--   8 preparar_liquidacion_mensual idempotente
--   9 pay_liquidacion_coach no duplica gasto (reusa el de aprobación)
-- ============================================================

DO $$
DECLARE
  v_admin uuid;
  v_coach uuid;
  v_sede uuid;
  v_hon uuid;
  v_ag_ok uuid;
  v_ag_sin uuid;
  v_serv uuid;
  v_serv_sin uuid;
  v_res uuid;
  v_res2 uuid;
  v_clase1 uuid;
  v_clase2 uuid;
  v_mov record;
  v_liq uuid;
  v_liq2 uuid;
  v_n int;
  v_out text := '';
  v_fecha date := CURRENT_DATE;
BEGIN
  SELECT user_id INTO v_admin FROM public.admin_profiles
    WHERE role = 'super_admin' AND user_id IS NOT NULL LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'No hay super_admin para correr los tests'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  SELECT id INTO v_sede FROM public.sedes LIMIT 1;

  INSERT INTO public.coaches (nombre, email, estado)
  VALUES ('ZZ Test Coach Liq', 'zz.test.liq@example.invalid', 'activo')
  RETURNING id INTO v_coach;

  INSERT INTO public.honorarios (nombre_concepto, categoria, valor)
  VALUES ('ZZ Test Grupal', 'clase', 10000) RETURNING id INTO v_hon;

  INSERT INTO public.agenda_grupal (coach_id, honorario_id, dia_semana, hora_inicio, hora_fin, grupo, sede_id)
  VALUES (v_coach, v_hon, 1, '08:00', '09:30', 'G3', v_sede) RETURNING id INTO v_ag_ok;

  INSERT INTO public.agenda_grupal (coach_id, dia_semana, hora_inicio, hora_fin, grupo, sede_id)
  VALUES (v_coach, 2, '10:00', '11:30', 'G4', v_sede) RETURNING id INTO v_ag_sin;

  ---------------------------------------------------------------- 1 y 2
  v_clase1 := public.confirmar_clase_grupal(v_ag_ok, v_fecha, NULL, 'test');
  v_clase2 := public.confirmar_clase_grupal(v_ag_ok, v_fecha, NULL, 'test');
  IF v_clase1 <> v_clase2 THEN RAISE EXCEPTION 'T1 FAIL: clase duplicada'; END IF;

  SELECT count(*) INTO v_n FROM public.movimientos_liquidacion
    WHERE coach_id = v_coach AND origen = 'agenda_admin';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 FAIL: % movimientos (esperado 1)', v_n; END IF;
  v_out := v_out || E'\nT1 PASS idempotencia clase grupal';

  SELECT m.* INTO v_mov FROM public.movimientos_liquidacion m
    JOIN public.clases_dictadas c ON c.movimiento_id = m.id WHERE c.id = v_clase1;
  IF v_mov.id IS NULL THEN RAISE EXCEPTION 'T2 FAIL: clases_dictadas.movimiento_id no vinculado'; END IF;
  IF v_mov.total <> 10000 OR v_mov.estado_economico <> 'liquidable'
     OR v_mov.tipo_actividad <> 'grupal_1h30' THEN
    RAISE EXCEPTION 'T2 FAIL: total=% estado=% tipo=%', v_mov.total, v_mov.estado_economico, v_mov.tipo_actividad;
  END IF;
  v_out := v_out || E'\nT2 PASS snapshot honorario + regla';

  ---------------------------------------------------------------- 3
  PERFORM public.confirmar_clase_grupal(v_ag_sin, v_fecha, NULL, NULL);
  SELECT m.* INTO v_mov FROM public.movimientos_liquidacion m
    JOIN public.clases_dictadas c ON c.movimiento_id = m.id WHERE c.agenda_id = v_ag_sin;
  IF v_mov.estado_economico <> 'pendiente_revision' OR v_mov.total <> 0
     OR v_mov.observaciones NOT ILIKE '%Honorario no configurado%' THEN
    RAISE EXCEPTION 'T3 FAIL: estado=% total=% obs=%', v_mov.estado_economico, v_mov.total, v_mov.observaciones;
  END IF;
  v_out := v_out || E'\nT3 PASS honorario ausente → pendiente_revision 0';

  ---------------------------------------------------------------- 4
  SELECT estado_economico INTO v_out FROM public.aplicar_regla_liquidacion('zz_tipo_inexistente','realizada', 5000);
  IF v_out <> 'pendiente_revision' THEN RAISE EXCEPTION 'T4 FAIL: %', v_out; END IF;
  v_out := 'T4 PASS regla ausente → pendiente_revision';

  ---------------------------------------------------------------- 5 y 6
  INSERT INTO public.servicios_turnera (slug, nombre, duracion_minutos, precio, tipo_actividad, honorario_id)
  VALUES ('zz-test-liq', 'ZZ Test Servicio', 60, 50000, 'personalizada', v_hon) RETURNING id INTO v_serv;
  INSERT INTO public.servicios_turnera (slug, nombre, duracion_minutos, precio, tipo_actividad)
  VALUES ('zz-test-liq-sin', 'ZZ Test Servicio sin honorario', 60, 50000, 'personalizada') RETURNING id INTO v_serv_sin;

  INSERT INTO public.reservas_turnera (servicio_id, coach_id, sede_id, fecha, hora_inicio, hora_fin, nombre, apellido, estado_operativo)
  VALUES (v_serv, v_coach, v_sede, v_fecha, '15:00', '16:00', 'ZZ', 'Test', 'reservada') RETURNING id INTO v_res;

  UPDATE public.reservas_turnera SET estado_operativo = 'realizada' WHERE id = v_res;
  UPDATE public.reservas_turnera SET estado_operativo = 'realizada' WHERE id = v_res;
  PERFORM public.marcar_reserva_turnera_realizada(v_res);

  SELECT count(*) INTO v_n FROM public.movimientos_liquidacion WHERE reserva_turnera_id = v_res;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T5 FAIL: % movimientos turnera', v_n; END IF;
  SELECT * INTO v_mov FROM public.movimientos_liquidacion WHERE reserva_turnera_id = v_res;
  IF v_mov.total <> 10000 OR v_mov.estado_economico <> 'liquidable' OR v_mov.origen <> 'turnera' THEN
    RAISE EXCEPTION 'T5 FAIL: total=% estado=%', v_mov.total, v_mov.estado_economico;
  END IF;
  v_out := v_out || E'\nT5 PASS turnera idempotente + honorario snapshot';

  INSERT INTO public.reservas_turnera (servicio_id, coach_id, sede_id, fecha, hora_inicio, hora_fin, nombre, estado_operativo)
  VALUES (v_serv_sin, v_coach, v_sede, v_fecha, '17:00', '18:00', 'ZZ2', 'realizada') RETURNING id INTO v_res2;
  SELECT * INTO v_mov FROM public.movimientos_liquidacion WHERE reserva_turnera_id = v_res2;
  IF v_mov.estado_economico <> 'pendiente_revision' OR v_mov.total <> 0 THEN
    RAISE EXCEPTION 'T6 FAIL: estado=% total=%', v_mov.estado_economico, v_mov.total;
  END IF;
  v_out := v_out || E'\nT6 PASS turnera sin honorario → pendiente_revision 0';

  ---------------------------------------------------------------- 7
  UPDATE public.coaches SET user_id = v_admin WHERE id = v_coach;
  PERFORM public.cargar_clase_manual_coach(v_fecha, 'grupal_1h30', v_hon, 'G3', NULL, 'manual test');
  SELECT * INTO v_mov FROM public.movimientos_liquidacion
    WHERE coach_id = v_coach AND origen = 'carga_coach' LIMIT 1;
  IF v_mov.estado_economico <> 'pendiente_revision' THEN
    RAISE EXCEPTION 'T7 FAIL: carga manual quedó %', v_mov.estado_economico;
  END IF;
  v_out := v_out || E'\nT7 PASS carga manual siempre pendiente_revision';

  ---------------------------------------------------------------- 8
  v_liq := public.preparar_liquidacion_mensual(v_coach, to_char(v_fecha,'YYYY-MM'));
  v_liq2 := public.preparar_liquidacion_mensual(v_coach, to_char(v_fecha,'YYYY-MM'));
  IF v_liq <> v_liq2 THEN RAISE EXCEPTION 'T8 FAIL: liquidación duplicada'; END IF;
  SELECT count(*) INTO v_n FROM public.liquidaciones_mensuales WHERE coach_id = v_coach;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T8 FAIL: % liquidaciones', v_n; END IF;
  SELECT total_confirmado INTO v_mov.total FROM public.liquidaciones_mensuales WHERE id = v_liq;
  IF v_mov.total <> 20000 THEN RAISE EXCEPTION 'T8 FAIL: total_confirmado=%', v_mov.total; END IF;
  v_out := v_out || E'\nT8 PASS cierre mensual idempotente (confirmado 20000)';

  ---------------------------------------------------------------- 9
  UPDATE public.liquidaciones_mensuales SET estado = 'aprobada' WHERE id = v_liq; -- crea gasto vía trigger
  SELECT count(*) INTO v_n FROM public.gastos WHERE liquidacion_id = v_liq;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T9 FAIL: aprobar creó % gastos', v_n; END IF;
  PERFORM public.pay_liquidacion_coach(v_liq, v_coach, to_char(v_fecha,'YYYY-MM'), 20000, 'ARS');
  PERFORM public.pay_liquidacion_coach(v_liq, v_coach, to_char(v_fecha,'YYYY-MM'), 20000, 'ARS');
  SELECT count(*) INTO v_n FROM public.gastos WHERE liquidacion_id = v_liq;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T9 FAIL: pagar duplicó gasto (%)', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gastos WHERE liquidacion_id = v_liq AND estado_conciliacion = 'conciliado') THEN
    RAISE EXCEPTION 'T9 FAIL: gasto no quedó conciliado';
  END IF;
  v_out := v_out || E'\nT9 PASS pago reutiliza el gasto, sin duplicar';

  RAISE EXCEPTION 'LIQ_TESTS_DONE %', v_out;
END $$;
