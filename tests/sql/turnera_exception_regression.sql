\set QUIET on
\set VERBOSITY terse
-- Fechas dinámicas futuras; el ejemplo comercial 14/11/2026 13:30–14:30 se cubre en Vitest.
SELECT public.t_assert(EXTRACT(DOW FROM date '2026-11-14') = 6, '14/11/2026 es sábado');

-- Comportamiento semanal normal: sigue pudiendo reservarse con anticipación suficiente.
INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30');
SELECT public.t_assert(public.t_call(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', current_date + 7, '13:30', '14:30') IS NOT NULL, 'bloque semanal normal reservable');

-- Excepcional sin exención: la anticipación grande sigue bloqueando.
INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, false);
SELECT public.t_expect_error('anticipación mínima', 'excepcional sin marca conserva anticipación', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', current_date + 7, '13:30', '14:30');

-- Excepcional con exención: una sola fecha, horario y servicio quedan habilitados.
INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, sede_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
SELECT public.t_assert(public.t_call(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', current_date + 7, '13:30', '14:30', '00000000-0000-0000-0000-000000000101') IS NOT NULL, 'excepcional marcado permite reserva próxima');

INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
SELECT public.t_expect_error('anticipación mínima', 'exención no se repite al sábado siguiente', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', current_date + 8, '13:30', '14:30');

INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
SELECT public.t_expect_error('anticipación mínima', 'exención no cubre otro servicio', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', current_date + 7, '13:30', '14:30');
SELECT public.t_expect_error('duración del turno', 'exención no cambia duración', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', current_date + 7, '13:30', '14:00');
SELECT public.t_expect_error('anticipación mínima', 'exención no se extiende fuera del bloque', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', current_date + 7, '14:30', '15:30');

-- La primera reserva ocupa el turno; no se crea capacidad paralela.
INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
SELECT public.t_call(gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', current_date + 7, '13:30', '14:30');
SELECT public.t_expect_error('acaba de ocuparse', 'segundo intento solapado rechazado', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', current_date + 7, '13:30', '14:30');
SELECT public.t_assert((SELECT count(*) FROM public.reservas_turnera WHERE coach_id = '00000000-0000-0000-0000-000000000006') = 1, 'una reserva no genera cupos adicionales');

-- Ausencia, clase grupal, bloqueo puntual y bloque inactivo siguen mandando.
INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
INSERT INTO public.ausencias_coaches(coach_id, fecha_inicio, fecha_fin) VALUES ('00000000-0000-0000-0000-000000000007', current_date + 7, current_date + 7);
SELECT public.t_expect_error('ya no está disponible', 'ausencia sigue bloqueando', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007', current_date + 7, '13:30', '14:30');

INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
INSERT INTO public.grupal_conflicts VALUES ('00000000-0000-0000-0000-000000000008', current_date + 7, '13:00', '14:00', 'G1');
SELECT public.t_expect_error('otra actividad del coach', 'clase grupal sigue bloqueando', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000008', current_date + 7, '13:30', '14:30');

INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
INSERT INTO public.disponibilidad_ajustada(coach_id, fecha, tipo) VALUES ('00000000-0000-0000-0000-000000000009', current_date + 7, 'bloquear');
SELECT public.t_expect_error('ya no está disponible', 'bloqueo puntual sigue bloqueando', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000009', current_date + 7, '13:30', '14:30');

INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima, activo)
VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true, false);
SELECT public.t_expect_error('anticipación mínima', 'bloque inactivo no habilita exención', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', current_date + 7, '13:30', '14:30');

INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, sede_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000101', EXTRACT(DOW FROM current_date + 7)::int, '13:30', '14:30', current_date + 7, true);
SELECT public.t_expect_error('anticipación mínima', 'exención no cruza a otra sede', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000011', current_date + 7, '13:30', '14:30', '00000000-0000-0000-0000-000000000102');

-- Omitir anticipación no habilita el pasado.
INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional, omitir_anticipacion_minima)
VALUES ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', EXTRACT(DOW FROM current_date - 1)::int, '13:30', '14:30', current_date - 1, true);
SELECT public.t_expect_error('ya pasó', 'turno pasado siempre rechazado', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', current_date - 1, '13:30', '14:30');

-- Restricciones de persistencia: edición directa tampoco puede crear una exención semanal.
DO $$ BEGIN
  INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, omitir_anticipacion_minima)
  VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 6, '13:30', '14:30', true);
  RAISE EXCEPTION 'FAIL: exención semanal aceptada';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: exención semanal rechazada por restricción';
END $$;
DO $$ BEGIN
  INSERT INTO public.disponibilidad_coaches(coach_id, servicio_id, dia_semana, hora_inicio, hora_fin, fecha_excepcional)
  VALUES ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000002', 5, '13:30', '14:30', date '2026-11-14');
  RAISE EXCEPTION 'FAIL: fecha y día inconsistentes aceptados';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: fecha excepcional debe coincidir con su día';
END $$;
