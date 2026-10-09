-- Beneficio de preinscripción: solo se consume con pago confirmado. Se revierte al final.
DO $$
DECLARE v_plan uuid; v_al uuid; v_sub uuid; v_b uuid; v_used timestamptz;
BEGIN
  SELECT id INTO v_plan FROM planes LIMIT 1;
  INSERT INTO alumnos(nombre, apellido, email, estado) VALUES ('QA','Benefit','qa-benefit-test@example.invalid','pendiente') RETURNING id INTO v_al;
  INSERT INTO suscripciones(alumno_id, plan_id, estado, precio_base, precio_final) VALUES (v_al, v_plan, 'pendiente_pago', 100, 100) RETURNING id INTO v_sub;
  INSERT INTO program_preinscripcion_benefits(plan_id, email, precio_total, valid_until, es_prueba, suscripcion_id)
    VALUES (v_plan, 'qa-benefit-test@example.invalid', 100, current_date + 5, true, v_sub) RETURNING id INTO v_b;

  -- Abandonado: sigue pendiente, beneficio intacto
  SELECT used_at INTO v_used FROM program_preinscripcion_benefits WHERE id = v_b;
  IF v_used IS NOT NULL THEN RAISE EXCEPTION 'FAIL abandonado consumió beneficio'; END IF;

  -- Fallido: MP marca cancelada, beneficio intacto
  UPDATE suscripciones SET estado = 'cancelada', mp_status = 'rejected' WHERE id = v_sub;
  SELECT used_at INTO v_used FROM program_preinscripcion_benefits WHERE id = v_b;
  IF v_used IS NOT NULL THEN RAISE EXCEPTION 'FAIL fallido consumió beneficio'; END IF;

  -- Reintento sobre la misma suscripción y aprobado: se consume
  UPDATE suscripciones SET estado = 'pendiente_pago' WHERE id = v_sub;
  UPDATE suscripciones SET estado = 'activa', mp_status = 'approved' WHERE id = v_sub;
  SELECT used_at INTO v_used FROM program_preinscripcion_benefits WHERE id = v_b;
  IF v_used IS NULL THEN RAISE EXCEPTION 'FAIL aprobado no consumió beneficio'; END IF;
  IF (public.get_program_benefit((SELECT token FROM program_preinscripcion_benefits WHERE id = v_b))->>'valid')::boolean THEN
    RAISE EXCEPTION 'FAIL enlace sigue válido tras pago aprobado';
  END IF;

  RAISE EXCEPTION 'OK_ALL_PASSED (rollback)';
END $$;
