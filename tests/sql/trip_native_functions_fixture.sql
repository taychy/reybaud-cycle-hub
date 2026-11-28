-- Exact native function definitions read from Cloud on 2026-11-28; fixtures contain no customer data.

CREATE OR REPLACE FUNCTION public._accept_reservation_terms(p_reservation_id uuid, p_version text, p_canal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; snap jsonb; v_at timestamptz := now();
BEGIN
  SELECT * INTO r FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF NOT r.terminos_pendientes THEN RAISE EXCEPTION 'Esta reserva no tiene condiciones pendientes'; END IF;
  snap := public.event_terms_snapshot(r.event_id);
  IF snap IS NULL THEN RAISE EXCEPTION 'El viaje no tiene condiciones cargadas'; END IF;
  IF p_version IS DISTINCT FROM snap->>'version' THEN
    RAISE EXCEPTION 'Las condiciones se actualizaron. Recargá la página para leer la versión vigente.';
  END IF;
  snap := snap || jsonb_build_object('aceptado_at', v_at, 'canal', p_canal, 'aceptado_por_user_id', auth.uid());
  PERFORM set_config('app.terms_internal', 'on', true);
  UPDATE public.event_reservations SET accepted_terms = true, terminos_aceptados_at = v_at,
    terminos_version_aceptada = snap->>'version', terminos_snapshot = snap,
    terminos_pendientes = false, terminos_token = NULL, terminos_token_expires_at = NULL, updated_at = v_at
  WHERE id = p_reservation_id;
  PERFORM set_config('app.terms_internal', 'off', true);
  INSERT INTO public.reservation_status_history (reservation_id, old_reservation_status, new_reservation_status,
    old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (r.id, r.reservation_status, r.reservation_status, r.payment_status, r.payment_status, auth.uid(),
    CASE WHEN p_canal = 'enlace' THEN 'participante_enlace' ELSE 'alumno' END,
    'Condiciones aceptadas (versión ' || (snap->>'version') || ')');
  RETURN jsonb_build_object('ok', true, 'aceptado_at', v_at, 'version', snap->>'version');
END $function$;

CREATE OR REPLACE FUNCTION public.event_terms_snapshot(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e record; m jsonb; trip boolean; s text; c text; p text; r text; u text;
BEGIN
  SELECT type::text AS type, metadata INTO e FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  m := COALESCE(e.metadata, '{}'::jsonb);
  trip := e.type IN ('camp','viaje','training_camp');
  s := NULLIF(m->>'politica_sena','');
  c := COALESCE(NULLIF(m->>'politica_cancelacion',''), NULLIF(m->>'cancellation_text_full',''));
  p := NULLIF(m->>'politica_pagos','');
  r := NULLIF(m->>'reglamento_texto','');
  u := COALESCE(NULLIF(m->>'reglamento',''), NULLIF(m->>'reglamento_url',''), '');
  IF trip THEN
    s := COALESCE(s, 'La seña confirma tu lugar en el evento y NO es reembolsable. Se descuenta del total del paquete contratado.');
    c := COALESCE(c, E'• Hasta 30 días antes del inicio: devolución del saldo abonado (la seña no se reintegra).\n• Entre 30 y 15 días antes: 50% del saldo abonado (la seña no se reintegra).\n• Menos de 15 días antes o no presentarse: sin devolución.\n• Casos de fuerza mayor (lesión con certificado médico, fallecimiento de familiar directo) se evalúan individualmente y pueden generar crédito a favor para futuros eventos.');
    p := COALESCE(p, E'• El saldo puede abonarse en cuotas según el plan elegido al reservar.\n• Métodos de pago: Mercado Pago (link), transferencia bancaria o efectivo.\n• La última cuota vence 7 días antes del inicio del evento.\n• Si una cuota queda impaga, el equipo se contactará para regularizar antes de liberar el cupo.');
    r := COALESCE(r, E'PARTICIPACIÓN Y RESPONSABILIDAD\n• El participante declara estar en condiciones físicas para realizar la actividad y, si corresponde, contar con certificado médico vigente.\n• Es responsabilidad del participante contar con seguro de viaje y/o accidentes personales propio.\n\nEQUIPAMIENTO OBLIGATORIO\n• Casco homologado (uso obligatorio en todas las salidas).\n• Bicicleta en buen estado mecánico, revisada antes del viaje.\n• Luz delantera y trasera para salidas con poca luz.\n• Kit básico de reparación (cámara, infladores, herramientas).\n\nDURANTE EL EVENTO\n• Respetar los horarios de salida y el ritmo del grupo asignado.\n• Seguir las indicaciones de coaches y guías en todo momento.\n• Respetar a compañeros/as, staff, alojamiento y entorno natural.\n• Durante las salidas en bicicleta se prioriza la seguridad y el consumo responsable. Las degustaciones de vino previstas en el programa se realizan en los momentos y lugares organizados para esa actividad.\n\nALOJAMIENTO Y CONVIVENCIA\n• Cuidar el alojamiento y los espacios comunes.\n• Respetar los horarios de descanso del grupo.\n• Cualquier daño causado al alojamiento corre por cuenta del participante.\n\nDERECHO DE ADMISIÓN\nLa organización se reserva el derecho de admisión y permanencia ante incumplimiento del reglamento, sin generar derecho a reembolso.\n\nUSO DE IMAGEN\nDurante el evento se toman fotos y videos que pueden usarse con fines de difusión de la escuela. Si no querés aparecer, avisanos al inicio del viaje.');
  END IF;
  IF s IS NULL AND c IS NULL AND p IS NULL AND r IS NULL AND u = '' THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('politica_sena', COALESCE(s,''), 'politica_cancelacion', COALESCE(c,''),
    'politica_pagos', COALESCE(p,''), 'reglamento_texto', COALESCE(r,''), 'reglamento_url', u,
    'version', COALESCE(NULLIF(m->>'terminos_version',''), '1'))
    || CASE WHEN m ? 'cancellation_rules' THEN jsonb_build_object('cancellation_rules', m->'cancellation_rules') ELSE '{}'::jsonb END;
END $function$;

CREATE OR REPLACE FUNCTION public.build_payment_plan_snapshot(p_plan_id uuid, p_precio_final numeric, p_fecha_reserva date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record;
  v_sena numeric;
  v_saldo numeric;
  v_accum numeric := 0;
  v_count int;
  v_idx int := 0;
  v_monto numeric;
  v_rec record;
  v_cuotas jsonb := '[]'::jsonb;
  v_cuotas_final jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_due date;
  v_cuotas_total numeric := 0;
  v_vencidas numeric := 0;
  v_diff numeric;
  v_template jsonb;
  v_reminders jsonb;
  v_sena_due date;
BEGIN
  SELECT * INTO v_plan FROM public.event_package_payment_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de pagos % no encontrado', p_plan_id;
  END IF;

  IF COALESCE(p_precio_final, 0) <= 0 THEN
    RAISE EXCEPTION 'El precio final debe ser mayor a 0 para calcular el plan de pagos';
  END IF;

  v_sena := CASE
    WHEN v_plan.sena_tipo = 'monto_fijo' THEN round(COALESCE(v_plan.sena_valor, 0), 2)
    ELSE round(p_precio_final * COALESCE(v_plan.sena_valor, 0) / 100.0, 2)
  END;

  IF v_sena < 0 THEN RAISE EXCEPTION 'La seña no puede ser negativa'; END IF;
  IF v_sena > p_precio_final THEN RAISE EXCEPTION 'La seña no puede ser mayor al precio del paquete'; END IF;

  v_saldo := round(p_precio_final - v_sena, 2);

  SELECT count(*) INTO v_count
  FROM public.event_package_payment_plan_installments WHERE plan_id = p_plan_id;

  IF v_count <> COALESCE(v_plan.cantidad_cuotas, v_count) THEN
    RAISE EXCEPTION 'El plan "%" define % cuotas pero cantidad_cuotas = %. Revisá la configuración del plan.',
      v_plan.nombre, v_count, v_plan.cantidad_cuotas;
  END IF;

  FOR v_rec IN
    SELECT * FROM public.event_package_payment_plan_installments
    WHERE plan_id = p_plan_id ORDER BY numero ASC
  LOOP
    v_idx := v_idx + 1;
    v_monto := CASE
      WHEN v_rec.monto_tipo = 'fijo' THEN round(COALESCE(v_rec.monto_valor, 0), 2)
      ELSE round(v_saldo * COALESCE(v_rec.monto_valor, 0) / 100.0, 2)
    END;

    IF v_idx = v_count AND COALESCE(v_plan.last_installment_absorbs_rounding, false) THEN
      v_monto := round(v_saldo - v_accum, 2);
    ELSE
      v_accum := round(v_accum + v_monto, 2);
    END IF;

    v_reminders := CASE
      WHEN jsonb_typeof(v_rec.reminders_config) = 'array'
           AND jsonb_array_length(v_rec.reminders_config) > 0 THEN v_rec.reminders_config
      WHEN v_idx = v_count THEN '[-14,-7,-2,0,3,7]'::jsonb
      ELSE '[-7,-2,0,3,7]'::jsonb
    END;

    v_due := COALESCE(v_rec.fecha_vencimiento, p_fecha_reserva);

    v_cuotas := v_cuotas || jsonb_build_object(
      'numero', v_rec.numero,
      'installment_type', 'cuota',
      'descripcion', COALESCE(NULLIF(v_rec.descripcion, ''), 'Cuota ' || v_rec.numero::text),
      'monto', v_monto,
      'due_date', to_char(v_due, 'YYYY-MM-DD'),
      'due_date_original', to_char(v_due, 'YYYY-MM-DD'),
      'reprogramada', false,
      'reminders_config', v_reminders
    );
    v_cuotas_total := round(v_cuotas_total + v_monto, 2);
  END LOOP;

  v_diff := round(p_precio_final - v_sena - v_cuotas_total, 2);
  IF abs(v_diff) > 0.01 THEN
    RAISE EXCEPTION 'Plan inválido: seña + cuotas (%) ≠ precio (%). Diferencia %.',
      (v_sena + v_cuotas_total), p_precio_final, v_diff;
  END IF;

  -- Regla de reserva tardía
  FOR v_elem IN SELECT jsonb_array_elements(v_cuotas) LOOP
    v_due := (v_elem->>'due_date')::date;
    IF v_due < p_fecha_reserva THEN
      IF v_plan.regla_reserva_tardia = 'cobrar_al_reservar' THEN
        v_vencidas := round(v_vencidas + (v_elem->>'monto')::numeric, 2);
      ELSIF v_plan.regla_reserva_tardia = 'reprogramar_a_hoy' THEN
        v_cuotas_final := v_cuotas_final || (v_elem
          || jsonb_build_object('due_date', to_char(p_fecha_reserva, 'YYYY-MM-DD'), 'reprogramada', true));
      ELSE
        v_cuotas_final := v_cuotas_final || v_elem;
      END IF;
    ELSE
      v_cuotas_final := v_cuotas_final || v_elem;
    END IF;
  END LOOP;

  v_sena := round(v_sena + v_vencidas, 2);
  v_sena_due := p_fecha_reserva + COALESCE(v_plan.sena_vence_dias, 0);

  SELECT COALESCE(sum((e->>'monto')::numeric), 0) INTO v_cuotas_total
  FROM jsonb_array_elements(v_cuotas_final) e;

  SELECT jsonb_build_object(
    'id', v_plan.id,
    'nombre', v_plan.nombre,
    'sena_tipo', v_plan.sena_tipo,
    'sena_valor', v_plan.sena_valor,
    'sena_vence_dias', COALESCE(v_plan.sena_vence_dias, 0),
    'cantidad_cuotas', v_plan.cantidad_cuotas,
    'last_installment_absorbs_rounding', COALESCE(v_plan.last_installment_absorbs_rounding, false),
    'regla_reserva_tardia', v_plan.regla_reserva_tardia,
    'installments', COALESCE(jsonb_agg(jsonb_build_object(
        'numero', i.numero, 'descripcion', i.descripcion, 'monto_tipo', i.monto_tipo,
        'monto_valor', i.monto_valor,
        'fecha_vencimiento', to_char(i.fecha_vencimiento, 'YYYY-MM-DD'),
        'reminders_config', i.reminders_config) ORDER BY i.numero), '[]'::jsonb)
  ) INTO v_template
  FROM public.event_package_payment_plan_installments i
  WHERE i.plan_id = p_plan_id;

  RETURN jsonb_build_object(
    'version', v_plan.version,
    'template', v_template,
    'precio_final', p_precio_final,
    'fecha_reserva', to_char(p_fecha_reserva, 'YYYY-MM-DD'),
    'calculated', jsonb_build_object(
      'ok', true,
      'total', p_precio_final,
      'sena_monto', v_sena,
      'cuotas_total', v_cuotas_total,
      'diff', 0,
      'errors', '[]'::jsonb,
      'installments', jsonb_build_array(jsonb_build_object(
        'numero', 0,
        'installment_type', 'sena',
        'descripcion', 'Seña',
        'monto', v_sena,
        'due_date', to_char(v_sena_due, 'YYYY-MM-DD'),
        'due_date_original', to_char(v_sena_due, 'YYYY-MM-DD'),
        'reprogramada', false,
        'reminders_config', '[0,1,3]'::jsonb
      )) || v_cuotas_final
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_reservation_installments(p_reservation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid;
  v_event_currency text;
  v_plan_snapshot jsonb;
  v_inserted integer := 0;
BEGIN
  SELECT er.event_id,
         COALESCE(er.currency_snapshot, er.moneda, e.currency, 'ARS'),
         er.payment_plan_snapshot
    INTO v_event_id, v_event_currency, v_plan_snapshot
  FROM public.event_reservations er
  JOIN public.events e ON e.id = er.event_id
  WHERE er.id = p_reservation_id;

  IF v_event_id IS NULL THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(v_plan_snapshot->'calculated'->'installments') = 'array' THEN
    INSERT INTO public.reservation_installments (
      reservation_id,
      event_installment_id,
      installment_number,
      label,
      amount,
      currency,
      due_date,
      sort_order,
      status,
      paid_amount,
      balance_due,
      installment_type,
      monto_original,
      monto_pagado,
      saldo_pendiente,
      due_date_original,
      original_due_date,
      notas
    )
    SELECT
      p_reservation_id,
      NULL::uuid,
      COALESCE(NULLIF(elem->>'numero', '')::int, (ord - 1)::int),
      COALESCE(NULLIF(elem->>'descripcion', ''), CASE WHEN elem->>'installment_type' = 'sena' THEN 'Seña' ELSE 'Cuota ' || COALESCE(elem->>'numero', ord::text) END),
      COALESCE(NULLIF(elem->>'monto', '')::numeric, 0),
      v_event_currency,
      CASE WHEN COALESCE(elem->>'due_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (elem->>'due_date')::date ELSE NULL END,
      (ord - 1)::int,
      'pendiente',
      0,
      COALESCE(NULLIF(elem->>'monto', '')::numeric, 0),
      CASE WHEN elem->>'installment_type' = 'sena' THEN 'sena'::public.installment_type_enum ELSE 'cuota'::public.installment_type_enum END,
      COALESCE(NULLIF(elem->>'monto', '')::numeric, 0),
      0,
      COALESCE(NULLIF(elem->>'monto', '')::numeric, 0),
      CASE WHEN COALESCE(elem->>'due_date_original', elem->>'due_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN COALESCE(elem->>'due_date_original', elem->>'due_date')::date ELSE NULL END,
      CASE WHEN COALESCE(elem->>'due_date_original', elem->>'due_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN COALESCE(elem->>'due_date_original', elem->>'due_date')::date ELSE NULL END,
      CASE WHEN COALESCE((elem->>'reprogramada')::boolean, false) THEN 'Reprogramada por reserva tardía' ELSE NULL END
    FROM jsonb_array_elements(v_plan_snapshot->'calculated'->'installments') WITH ORDINALITY AS t(elem, ord)
    ON CONFLICT (reservation_id, installment_number) DO UPDATE
    SET label = EXCLUDED.label,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        due_date = EXCLUDED.due_date,
        sort_order = EXCLUDED.sort_order,
        installment_type = EXCLUDED.installment_type,
        monto_original = EXCLUDED.monto_original,
        due_date_original = EXCLUDED.due_date_original,
        original_due_date = EXCLUDED.original_due_date,
        notas = COALESCE(public.reservation_installments.notas, EXCLUDED.notas),
        updated_at = now();

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);
    RETURN v_inserted;
  END IF;

  INSERT INTO public.reservation_installments (
    reservation_id,
    event_installment_id,
    installment_number,
    label,
    amount,
    currency,
    due_date,
    sort_order,
    status,
    paid_amount,
    balance_due
  )
  SELECT
    p_reservation_id,
    ei.id,
    ei.number,
    ei.label,
    ei.amount,
    COALESCE(ei.currency, v_event_currency),
    ei.due_date,
    ei.sort_order,
    'pendiente',
    0,
    ei.amount
  FROM public.event_installments ei
  WHERE ei.event_id = v_event_id
    AND ei.active = true
  ON CONFLICT (reservation_id, installment_number) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);
  RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_reservation_payment_totals(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_amount_total   numeric;
  v_amount_paid    numeric;
  v_condoned_total numeric;
  v_balance        numeric;
  v_new_status     text;
  v_old_status     text;
  v_event_currency text;
  v_pool           numeric;
  v_inst           record;
  v_owe            numeric;
  v_apply          numeric;
  v_spec           numeric;
  v_status         text;
BEGIN
  SELECT COALESCE(r.currency_snapshot, e.currency, 'ARS')
    INTO v_event_currency
  FROM public.event_reservations r
  LEFT JOIN public.events e ON e.id = r.event_id
  WHERE r.id = p_reservation_id;

  SELECT COALESCE(SUM(COALESCE(p.equivalent_amount_event_currency,
           CASE WHEN COALESCE(p.currency, v_event_currency) = v_event_currency THEN p.amount END, 0)), 0)
    INTO v_amount_paid
  FROM public.reservation_payments p
  WHERE p.reservation_id = p_reservation_id
    AND p.status = 'validado'
    AND p.anulado_at IS NULL;

  SELECT COALESCE(SUM(condoned_amount), 0) INTO v_condoned_total
  FROM public.reservation_installments WHERE reservation_id = p_reservation_id;

  SELECT amount_total, payment_status INTO v_amount_total, v_old_status
  FROM public.event_reservations WHERE id = p_reservation_id;

  v_amount_total := COALESCE(v_amount_total, 0);
  v_balance := GREATEST(v_amount_total - v_amount_paid - v_condoned_total, 0);

  IF v_amount_total <= 0 THEN
    v_new_status := COALESCE(v_old_status, 'no_aplica');
  ELSIF (v_amount_paid + v_condoned_total) <= 0 THEN
    IF EXISTS (SELECT 1 FROM public.reservation_payments
               WHERE reservation_id = p_reservation_id AND status = 'informado' AND anulado_at IS NULL) THEN
      v_new_status := 'pago_informado';
    ELSE
      v_new_status := 'no_informado';
    END IF;
  ELSIF v_balance <= 0 THEN
    v_new_status := 'pago_validado';
  ELSE
    v_new_status := 'parcial';
  END IF;

  UPDATE public.event_reservations
  SET amount_paid = v_amount_paid, balance_due = v_balance,
      payment_status = v_new_status, updated_at = now()
  WHERE id = p_reservation_id;

  -- Pool = pagado − lo aplicado por destino explícito marcado (tope: deuda de la cuota vigente).
  SELECT v_amount_paid - COALESCE(SUM(LEAST(GREATEST(ri.amount - COALESCE(ri.condoned_amount, 0), 0), s.eq)), 0)
    INTO v_pool
  FROM public.reservation_installments ri
  JOIN (SELECT p.installment_id,
               SUM(COALESCE(p.equivalent_amount_event_currency,
                   CASE WHEN COALESCE(p.currency, v_event_currency) = v_event_currency THEN p.amount END, 0)) eq
          FROM public.reservation_payments p
         WHERE p.reservation_id = p_reservation_id AND p.status = 'validado'
           AND p.anulado_at IS NULL AND p.mp_explicit_installment AND p.installment_id IS NOT NULL
         GROUP BY p.installment_id) s ON s.installment_id = ri.id
  WHERE ri.reservation_id = p_reservation_id
    AND ri.status IS DISTINCT FROM 'reprogramada'
    AND COALESCE(ri.condoned_amount, 0) < ri.amount;
  v_pool := GREATEST(COALESCE(v_pool, v_amount_paid), 0);

  FOR v_inst IN
    SELECT id, amount, COALESCE(condoned_amount, 0) AS condoned_amount, installment_number, status
    FROM public.reservation_installments
    WHERE reservation_id = p_reservation_id
    ORDER BY installment_number ASC, due_date ASC NULLS LAST, id ASC
  LOOP
    IF v_inst.status = 'reprogramada' THEN
      UPDATE public.reservation_installments
      SET paid_amount = 0, monto_pagado = 0,
          balance_due = GREATEST(v_inst.amount - v_inst.condoned_amount, 0),
          saldo_pendiente = GREATEST(v_inst.amount - v_inst.condoned_amount, 0),
          updated_at = now()
      WHERE id = v_inst.id;
      CONTINUE;
    END IF;

    IF v_inst.condoned_amount >= v_inst.amount THEN
      UPDATE public.reservation_installments
      SET paid_amount = 0, monto_pagado = 0, balance_due = 0, saldo_pendiente = 0,
          status = 'condonada', updated_at = now()
      WHERE id = v_inst.id;
      CONTINUE;
    END IF;

    v_owe := GREATEST(v_inst.amount - v_inst.condoned_amount, 0);
    SELECT LEAST(v_owe, COALESCE(SUM(COALESCE(p.equivalent_amount_event_currency,
             CASE WHEN COALESCE(p.currency, v_event_currency) = v_event_currency THEN p.amount END, 0)), 0))
      INTO v_spec
    FROM public.reservation_payments p
    WHERE p.installment_id = v_inst.id AND p.reservation_id = p_reservation_id
      AND p.status = 'validado' AND p.anulado_at IS NULL AND p.mp_explicit_installment;

    v_apply := LEAST(v_pool, v_owe - v_spec);
    v_pool := v_pool - v_apply;
    v_apply := v_apply + v_spec;

    IF (v_apply + v_inst.condoned_amount) <= 0 THEN
      v_status := 'pendiente';
    ELSIF v_apply >= v_owe THEN
      v_status := 'pagada';
    ELSE
      v_status := 'parcial';
    END IF;

    UPDATE public.reservation_installments
    SET paid_amount = v_apply, monto_pagado = v_apply,
        balance_due = GREATEST(v_owe - v_apply, 0),
        saldo_pendiente = GREATEST(v_owe - v_apply, 0),
        status = v_status, updated_at = now()
    WHERE id = v_inst.id;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_reservation_terms_pending_on_admin_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by = 'admin' AND NEW.terminos_aceptados_at IS NULL
     AND public.event_terms_snapshot(NEW.event_id) IS NOT NULL THEN
    NEW.accepted_terms := false;
    NEW.terminos_pendientes := true;
    NEW.terminos_token := encode(extensions.gen_random_bytes(24), 'hex');
    NEW.terminos_token_expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.get_reservation_terms_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; ev record; nombre text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN jsonb_build_object('status','invalido'); END IF;
  SELECT * INTO r FROM public.event_reservations WHERE terminos_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalido'); END IF;
  IF r.terminos_token_expires_at IS NULL OR r.terminos_token_expires_at < now() THEN
    RETURN jsonb_build_object('status','expirado');
  END IF;
  SELECT title, date, end_date INTO ev FROM public.events WHERE id = r.event_id;
  SELECT COALESCE(a.nombre, r.external_first_name) INTO nombre FROM (SELECT 1) x
    LEFT JOIN public.alumnos a ON a.id = r.alumno_id;
  RETURN jsonb_build_object('status','pendiente', 'event_title', ev.title, 'event_date', ev.date,
    'event_end_date', ev.end_date, 'package', r.package_nombre_snapshot,
    'nombre', split_part(COALESCE(nombre, r.external_first_name, ''), ' ', 1),
    'terms', public.event_terms_snapshot(r.event_id));
END $$;

CREATE OR REPLACE FUNCTION public.accept_reservation_terms_by_token(p_token text, p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.event_reservations
  WHERE terminos_token = p_token AND p_token IS NOT NULL AND length(p_token) >= 32
    AND terminos_token_expires_at >= now() AND terminos_pendientes;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Enlace inválido o vencido. Pedile uno nuevo a Administración.'; END IF;
  RETURN public._accept_reservation_terms(v_id, p_version, 'enlace');
END $$;

CREATE TRIGGER trg_reservation_terms_pending BEFORE INSERT ON public.event_reservations FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_terms_pending_on_admin_insert();

REVOKE ALL ON FUNCTION public._accept_reservation_terms(uuid,text,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.get_reservation_terms_by_token(text),public.accept_reservation_terms_by_token(text,text) TO anon,authenticated;
