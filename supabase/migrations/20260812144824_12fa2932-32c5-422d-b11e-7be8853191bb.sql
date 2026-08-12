CREATE OR REPLACE FUNCTION public.run_programa_bajas_tests()
RETURNS TABLE(test integer, estado text, nombre text, detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_cta uuid; v_plan uuid := gen_random_uuid();
  v_a1 uuid := gen_random_uuid(); v_a2 uuid := gen_random_uuid(); v_a3 uuid := gen_random_uuid();
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_mp uuid; v_smens uuid;
  v_tel text := '+54 9 11 4444-'; v_res jsonb; v_x numeric; v_y numeric; v_n int; v_err text;
  v_planm uuid := gen_random_uuid(); v_emails text[];
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

    v_res := public.check_programa_enrollment(v_a1, v_plan);
    v_out := v_out || jsonb_build_object('t',1,'n','Mismo alumno + mismo programa → ALREADY_ENROLLED',
      'ok', (v_res->>'already_enrolled')::boolean AND v_res->>'code' = 'ALREADY_ENROLLED', 'd', v_res::text);

    UPDATE public.alumnos SET emails_adicionales = ARRAY['qa-alt-'||v_a1||'@test.local'] WHERE id = v_a1;
    v_res := public.resolve_alumno_for_enrollment('qa-alt-'||v_a1||'@test.local','Qa','Programa', v_tel||'0001');
    v_out := v_out || jsonb_build_object('t',2,'n','Email adicional conocido → usa la ficha existente',
      'ok', (v_res->>'alumno_id')::uuid = v_a1 AND v_res->>'match' = 'email', 'd', v_res::text);

    v_res := public.resolve_alumno_for_enrollment('nuevo-'||v_a1||'@test.local','QA','programa', '11 4444-0001');
    v_out := v_out || jsonb_build_object('t',3,'n','Email nuevo + teléfono + nombre → misma persona, agrega email adicional',
      'ok', (v_res->>'alumno_id') IS NOT NULL AND v_res->>'match' = 'telefono_nombre'
            AND (v_res->>'agregar_email_adicional')::boolean, 'd', v_res::text);

    v_res := public.resolve_alumno_for_enrollment('nuevo2-'||v_a3||'@test.local','Tercero','Ajeno', v_tel||'0001');
    v_out := v_out || jsonb_build_object('t',4,'n','Mismo teléfono + persona distinta → POSIBLE_DUPLICADO, no fusiona',
      'ok', (v_res->>'alumno_id') IS NULL AND v_res->>'match' = 'posible_duplicado', 'd', v_res::text);

    v_err := NULL;
    BEGIN
      INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
        precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (v_a2, v_plan, 'activa', 'pendiente', 'cargado_admin', 164000, 164000, CURRENT_DATE, CURRENT_DATE+60);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_out := v_out || jsonb_build_object('t',5,'n','Barrera BD: doble inscripción cross-ficha con evidencia fuerte',
      'ok', v_err ILIKE '%DUPLICADO_CROSS_FICHA%', 'd', COALESCE(v_err,'no bloqueó'));

    v_err := NULL;
    BEGIN
      INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
        precio_base, precio_final, fecha_inicio, fecha_fin)
      VALUES (v_a3, v_plan, 'activa', 'pendiente', 'cargado_admin', 164000, 164000, CURRENT_DATE, CURRENT_DATE+60)
      RETURNING id INTO v_s3;
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_out := v_out || jsonb_build_object('t',6,'n','Solo coincide teléfono → advertencia, no bloqueo',
      'ok', v_err IS NULL, 'd', COALESCE(v_err,'permitido (correcto)'));

    SELECT COUNT(*) INTO v_n FROM public.vw_programa_posibles_duplicados d WHERE d.plan_id = v_plan;
    v_out := v_out || jsonb_build_object('t',7,'n','Detector cross-ficha encuentra el posible duplicado',
      'ok', v_n >= 1, 'd', format('%s par(es) detectados', v_n));

    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_a2, v_planm, 'pendiente', 'pendiente', 'cargado_admin', 83500, 83500, CURRENT_DATE, CURRENT_DATE+30)
    RETURNING id INTO v_s2;
    UPDATE public.planes SET es_programa_cerrado = true WHERE id = v_planm;
    v_res := public.dar_de_baja_programa(v_s2, 'QA baja sin pago', 'sin_pago');
    v_out := v_out || jsonb_build_object('t',8,'n','Baja sin pago: cancela y libera cupo',
      'ok', v_res->>'estado' = 'cancelada' AND (v_res->>'pagado_real')::numeric = 0, 'd', v_res::text);
    UPDATE public.planes SET es_programa_cerrado = false WHERE id = v_planm;

    SELECT pl.inscripciones_actuales INTO v_n FROM public.planes pl WHERE pl.id = v_plan;
    v_res := public.dar_de_baja_programa(v_s1, 'QA baja pagada', 'conservar_como_disponible');
    SELECT d.disponible INTO v_x FROM public.vw_pagos_disponibles d WHERE d.pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',9,'n','Baja pagada: libera cupo, conserva el pago como disponible',
      'ok', (v_res->>'pagado_real')::numeric = 164000 AND v_x = 164000
            AND (v_res->>'inscripciones_actuales')::int = v_n - 1,
      'd', format('pagado=%s disponible=%s cupos %s→%s', v_res->>'pagado_real', v_x, v_n, v_res->>'inscripciones_actuales'));

    SELECT COUNT(*) INTO v_n FROM public.mp_account_movements mm WHERE mm.id = v_mp AND mm.status = 'approved';
    v_out := v_out || jsonb_build_object('t',10,'n','La baja no borra el pago real de Mercado Pago',
      'ok', v_n = 1, 'd', format('movimientos MP conservados: %s', v_n));

    v_res := public.dar_de_baja_programa(v_s1, 'QA baja repetida', 'conservar_como_disponible');
    SELECT d.disponible INTO v_y FROM public.vw_pagos_disponibles d WHERE d.pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',11,'n','Cancelar dos veces no duplica saldo ni cupos',
      'ok', (v_res->>'ya_aplicada')::boolean AND v_y = 164000, 'd', format('disponible tras 2ª baja=%s', v_y));

    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_a1, v_planm, 'pendiente', 'pendiente', 'cargado_admin', 83500, 83500,
            date_trunc('month', CURRENT_DATE)::date, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date)
    RETURNING id INTO v_smens;
    v_res := public.aplicar_saldo_disponible('mp_movement', v_mp, 'suscripcion', v_smens, 83500);
    SELECT d.disponible INTO v_x FROM public.vw_pagos_disponibles d WHERE d.pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',12,'n','Pago 164.000 aplicado 83.500 → quedan 80.500 disponibles',
      'ok', v_x = 80500 AND public.obligacion_imputado('suscripcion', v_smens) = 83500,
      'd', format('disponible=%s imputado=%s', v_x, public.obligacion_imputado('suscripcion', v_smens)));

    v_res := public.aplicar_saldo_disponible('mp_movement', v_mp, 'suscripcion', v_smens, 83500);
    SELECT COUNT(*) INTO v_n FROM public.pagos_imputaciones pi
      WHERE pi.pago_origen_id = v_mp AND pi.obligacion_id = v_smens AND pi.anulado_at IS NULL;
    SELECT d.disponible INTO v_y FROM public.vw_pagos_disponibles d WHERE d.pago_origen_id = v_mp;
    v_out := v_out || jsonb_build_object('t',13,'n','Aplicar dos veces la misma imputación es idempotente',
      'ok', v_n = 1 AND v_y = 80500, 'd', format('imputaciones=%s disponible=%s', v_n, v_y));

    v_err := NULL;
    BEGIN
      PERFORM public.aplicar_saldo_disponible('mp_movement', v_mp, 'otro', gen_random_uuid(), 999999);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_out := v_out || jsonb_build_object('t',14,'n','No se puede aplicar más dinero del disponible',
      'ok', v_err IS NOT NULL, 'd', COALESCE(v_err,'permitió sobregiro'));

    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_a3, v_planm, 'activa', 'mp_externo_claudio', 'cargado_admin', 175000, 175000,
            CURRENT_DATE, CURRENT_DATE+30)
    RETURNING id INTO v_s2;
    SELECT COALESCE(SUM(m.haber),0) INTO v_x FROM public.vw_cuenta_corriente_movimientos m
      WHERE m.alumno_id = v_a3;
    UPDATE public.planes SET es_programa_cerrado = true WHERE id = v_planm;
    v_res := public.dar_de_baja_programa(v_s2, 'QA pago ficticio', 'conservar_como_disponible');
    SELECT COALESCE(SUM(m.haber),0) INTO v_y FROM public.vw_cuenta_corriente_movimientos m
      WHERE m.alumno_id = v_a3;
    UPDATE public.planes SET es_programa_cerrado = false WHERE id = v_planm;
    v_out := v_out || jsonb_build_object('t',15,'n','Pago manual sin operación real → no deja saldo a favor ficticio',
      'ok', v_x >= 175000 AND v_y = 0 AND (v_res->>'pago_ficticio_neutralizado')::boolean,
      'd', format('haber antes=%s después=%s', v_x, v_y));

    SELECT COUNT(*) INTO v_n FROM public.suscripciones su
      WHERE su.plan_id = v_plan AND su.estado IN ('activa','pendiente_pago','pendiente_verificacion');
    SELECT pl.inscripciones_actuales INTO v_x FROM public.planes pl WHERE pl.id = v_plan;
    v_out := v_out || jsonb_build_object('t',16,'n','Inscripción cancelada no cuenta como cupo ni como inscripto activo',
      'ok', v_x = v_n, 'd', format('vigentes=%s inscripciones_actuales=%s', v_n, v_x));

    -- Test 17: consolidación de emails al fusionar fichas (sin depender de la sesión admin).
    SELECT email INTO v_err FROM public.alumnos WHERE id = v_a2;
    UPDATE public.alumnos
       SET emails_adicionales = (
             SELECT ARRAY(SELECT DISTINCT e FROM unnest(COALESCE(emails_adicionales,'{}'::text[]) || ARRAY[v_err]) e))
     WHERE id = v_a1;
    UPDATE public.alumnos SET estado = 'fusionada' WHERE id = v_a2;
    SELECT emails_adicionales INTO v_emails FROM public.alumnos WHERE id = v_a1;
    v_res := public.resolve_alumno_for_enrollment(v_err, 'Qa', 'Programa', v_tel||'0001');
    v_out := v_out || jsonb_build_object('t',17,'n','Tras fusionar, el email de la ficha duplicada resuelve a la ficha principal',
      'ok', v_err = ANY(v_emails) AND (v_res->>'alumno_id')::uuid = v_a1,
      'd', format('emails_adicionales=%s resolve=%s', v_emails, v_res->>'alumno_id'));

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