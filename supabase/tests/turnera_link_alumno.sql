-- Test del trigger trg_link_turnera_alumno (auto-vinculación de reservas de Turnera).
-- Se ejecuta dentro de un bloque que SIEMPRE termina en excepción para forzar rollback:
-- si el mensaje final es TURNERA_LINK_TESTS_OK, todos los asserts pasaron.
DO $$
DECLARE
  v_servicio uuid;
  v_coach uuid;
  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_r  uuid;
  v_got uuid;
BEGIN
  SELECT id INTO v_servicio FROM public.servicios_turnera LIMIT 1;
  SELECT id INTO v_coach FROM public.coaches LIMIT 1;

  -- Alumno único con email y documento propios
  INSERT INTO public.alumnos (id, nombre, apellido, email, documento)
  VALUES (v_a1, 'ZZTest', 'Unico', 'zz.test.unico@example.invalid', '90111222');

  -- 1) match exacto y unívoco por email → asigna
  INSERT INTO public.reservas_turnera (servicio_id, coach_id, fecha, hora_inicio, hora_fin, nombre, apellido, email, precio_snapshot)
  VALUES (v_servicio, v_coach, current_date + 30, '10:00', '11:00', 'ZZTest', 'Unico', 'ZZ.Test.Unico@Example.Invalid', 1000)
  RETURNING id, alumno_id INTO v_r, v_got;
  IF v_got IS DISTINCT FROM v_a1 THEN RAISE EXCEPTION 'FAIL email match: %', v_got; END IF;

  -- 2) match por documento normalizado (con guiones) → asigna
  INSERT INTO public.reservas_turnera (servicio_id, coach_id, fecha, hora_inicio, hora_fin, nombre, apellido, email, documento, precio_snapshot)
  VALUES (v_servicio, v_coach, current_date + 30, '12:00', '13:00', 'ZZTest', 'Unico', 'zz.test.otro@example.invalid', '90.111.222', 1000)
  RETURNING alumno_id INTO v_got;
  IF v_got IS DISTINCT FROM v_a1 THEN RAISE EXCEPTION 'FAIL documento match: %', v_got; END IF;

  -- 3) email ambiguo (2 alumnos) → NO asigna
  INSERT INTO public.alumnos (id, nombre, apellido, email, documento)
  VALUES (v_a2, 'ZZTest', 'Ambiguo', 'zz.test.ambiguo@example.invalid', '90333444');
  UPDATE public.alumnos SET emails_adicionales = ARRAY['zz.test.ambiguo@example.invalid'] WHERE id = v_a1;

  INSERT INTO public.reservas_turnera (servicio_id, coach_id, fecha, hora_inicio, hora_fin, nombre, apellido, email, precio_snapshot)
  VALUES (v_servicio, v_coach, current_date + 30, '14:00', '15:00', 'ZZTest', 'Ambiguo', 'zz.test.ambiguo@example.invalid', 1000)
  RETURNING alumno_id INTO v_got;
  IF v_got IS NOT NULL THEN RAISE EXCEPTION 'FAIL ambiguo asignado: %', v_got; END IF;

  -- 4) sin coincidencia → NO asigna
  INSERT INTO public.reservas_turnera (servicio_id, coach_id, fecha, hora_inicio, hora_fin, nombre, apellido, email, documento, precio_snapshot)
  VALUES (v_servicio, v_coach, current_date + 30, '16:00', '17:00', 'ZZTest', 'Nadie', 'zz.test.nadie@example.invalid', '90999888', 1000)
  RETURNING alumno_id INTO v_got;
  IF v_got IS NOT NULL THEN RAISE EXCEPTION 'FAIL sin match asignado: %', v_got; END IF;

  -- 5) desvinculación explícita se respeta (no re-asigna)
  UPDATE public.reservas_turnera SET alumno_id = NULL WHERE id = v_r RETURNING alumno_id INTO v_got;
  IF v_got IS NOT NULL THEN RAISE EXCEPTION 'FAIL re-asignó tras desvincular: %', v_got; END IF;

  RAISE EXCEPTION 'TURNERA_LINK_TESTS_OK';
END $$;
