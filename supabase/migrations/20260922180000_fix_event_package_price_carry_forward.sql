-- Fix financiero: evitar fallback a event_packages.precio cuando las etapas ya comenzaron
-- pero la última ventana venció. También conserva addons en cambios de paquete y
-- calcula créditos de downgrade contra el total real (paquete + extras).

CREATE OR REPLACE FUNCTION public.get_package_active_price(
  p_package_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE(precio numeric, currency text, stage_id uuid, stage_nombre text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base_precio numeric;
  v_base_currency text;
BEGIN
  SELECT ep.precio, ep.currency
    INTO v_base_precio, v_base_currency
  FROM public.event_packages ep
  WHERE ep.id = p_package_id;

  RETURN QUERY
  SELECT s.precio, COALESCE(s.currency, v_base_currency), s.id, s.nombre
  FROM public.event_package_price_stages s
  WHERE s.package_id = p_package_id
    AND s.activo = true
    AND s.vigente_desde <= p_now
    AND (s.vigente_hasta IS NULL OR s.vigente_hasta > p_now)
  ORDER BY s.vigente_desde DESC
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.precio, COALESCE(s.currency, v_base_currency), s.id, s.nombre
  FROM public.event_package_price_stages s
  WHERE s.package_id = p_package_id
    AND s.activo = true
    AND s.vigente_desde <= p_now
  ORDER BY s.vigente_desde DESC
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT v_base_precio, v_base_currency, NULL::uuid, NULL::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.preview_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_roommate_propuesto_id uuid DEFAULT NULL::uuid,
  p_price_override numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation record;
  v_event record;
  v_pkg_actual record;
  v_pkg_nuevo record;
  v_precio_actual numeric;
  v_precio_nuevo numeric;
  v_currency_nuevo text;
  v_stage_id uuid;
  v_stage_nombre text;
  v_available_spots integer;
  v_total_capacity integer;
  v_amount_paid numeric;
  v_diff numeric;
  v_credit numeric := 0;
  v_debit numeric := 0;
  v_credit_reason text := NULL;
  v_room jsonb;
  v_status text := 'auto_applicable';
  v_clasif text;
  v_warnings text[] := ARRAY[]::text[];
  v_blockers text[] := ARRAY[]::text[];
  v_days_to_event integer;
  v_token text;
  v_price_source text := 'stage_vigente';
  v_addons_total numeric := 0;
  v_total_nuevo numeric := 0;
BEGIN
  SELECT * INTO v_reservation
  FROM public.event_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','no_posible','blockers', to_jsonb(ARRAY['Reserva no encontrada']));
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_reservation.event_id;
  SELECT * INTO v_pkg_actual FROM public.event_packages WHERE id = v_reservation.package_id;
  SELECT * INTO v_pkg_nuevo FROM public.event_packages WHERE id = p_package_nuevo_id;

  IF v_pkg_nuevo IS NULL OR v_pkg_nuevo.activo = false THEN
    v_blockers := array_append(v_blockers, 'El paquete destino no existe o está inactivo');
  END IF;
  IF p_package_nuevo_id = v_reservation.package_id AND p_price_override IS NULL THEN
    v_blockers := array_append(v_blockers, 'Ya tenés este paquete');
  END IF;
  IF v_reservation.reservation_status IN ('cancelada','rechazada','expirada') THEN
    v_blockers := array_append(v_blockers, 'Esta reserva no admite modificaciones');
  END IF;
  IF v_event.bloquear_cambios_despues_de_inicio
     AND v_event.date IS NOT NULL AND v_event.date <= CURRENT_DATE THEN
    v_blockers := array_append(v_blockers, 'El evento ya inició; solicitá cambios manuales al admin');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.event_package_change_requests
    WHERE reservation_id = p_reservation_id AND estado = 'pendiente'
  ) THEN
    v_blockers := array_append(v_blockers, 'Ya tenés una solicitud pendiente para esta reserva');
  END IF;

  SELECT COALESCE(SUM(capacidad), 0)
    INTO v_total_capacity
  FROM public.event_rooms
  WHERE package_id = p_package_nuevo_id;

  v_available_spots := public.get_package_available_spots(p_package_nuevo_id);

  IF p_package_nuevo_id <> COALESCE(v_reservation.package_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    IF v_total_capacity = 0 THEN
      v_blockers := array_append(v_blockers, 'El paquete destino no tiene habitaciones cargadas en Alojamiento — cargá al menos una para poder venderlo');
    ELSIF v_available_spots <= 0 THEN
      v_blockers := array_append(v_blockers, 'El paquete destino está completo (todas las habitaciones ocupadas)');
    END IF;
  END IF;

  IF array_length(v_blockers,1) > 0 THEN
    RETURN jsonb_build_object(
      'status','no_posible',
      'blockers', to_jsonb(v_blockers),
      'package_actual', to_jsonb(v_pkg_actual),
      'package_nuevo', to_jsonb(v_pkg_nuevo)
    );
  END IF;

  IF p_price_override IS NOT NULL THEN
    v_precio_nuevo := p_price_override;
    v_currency_nuevo := COALESCE(v_reservation.currency_snapshot, v_event.currency, 'ARS');
    v_stage_id := NULL;
    v_stage_nombre := 'Precio manual (admin)';
    v_price_source := 'manual';
  ELSE
    SELECT precio, currency, stage_id, stage_nombre
      INTO v_precio_nuevo, v_currency_nuevo, v_stage_id, v_stage_nombre
    FROM public.get_package_active_price(p_package_nuevo_id, now());

    IF v_stage_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.event_package_price_stages s
         WHERE s.id = v_stage_id
           AND s.vigente_desde <= now()
           AND (s.vigente_hasta IS NULL OR s.vigente_hasta > now())
       ) THEN
      v_price_source := 'stage_carry_forward';
    END IF;
  END IF;

  v_precio_actual := COALESCE(v_reservation.price_snapshot, v_pkg_actual.precio, 0);
  v_amount_paid := COALESCE(v_reservation.amount_paid, 0);
  v_diff := v_precio_nuevo - v_precio_actual;

  SELECT COALESCE(SUM(subtotal), 0)
    INTO v_addons_total
  FROM public.reservation_addons
  WHERE reservation_id = p_reservation_id;

  v_total_nuevo := COALESCE(v_precio_nuevo, 0) + COALESCE(v_addons_total, 0);

  IF v_diff < 0 THEN
    v_credit := GREATEST(0, v_amount_paid - v_total_nuevo);
    IF v_credit > 0 THEN
      v_credit_reason := 'El cliente pagó ' || v_amount_paid::text ||
                         ' y el nuevo total (paquete + extras) es ' || v_total_nuevo::text ||
                         '. La diferencia queda como crédito a favor.';
      v_warnings := array_append(v_warnings, 'Se generará un crédito por el excedente pagado sobre el total real');
    ELSE
      v_credit_reason := 'No se genera crédito: lo pagado no supera el nuevo total (paquete + extras). Se recalculan las cuotas pendientes.';
      v_warnings := array_append(v_warnings, 'Sin crédito: se recalculan las cuotas pendientes al nuevo total');
    END IF;

    IF NOT v_event.permitir_downgrade THEN
      RETURN jsonb_build_object(
        'status','no_posible',
        'blockers', to_jsonb(ARRAY['Este evento no permite bajar de paquete'])
      );
    END IF;
  ELSIF v_diff > 0 THEN
    v_debit := v_diff;
    v_warnings := array_append(v_warnings, 'Se recalculan las cuotas pendientes con la diferencia');
  END IF;

  v_room := public.evaluate_room_impact(p_reservation_id, p_package_nuevo_id, p_roommate_propuesto_id);
  v_clasif := public.classify_package_change(p_reservation_id, p_package_nuevo_id, v_room);

  IF (v_room->>'status') = 'no_posible' THEN
    RETURN jsonb_build_object(
      'status','no_posible',
      'blockers', to_jsonb(ARRAY['El cambio no es posible: ' || COALESCE((v_room->'razones'->>0), 'razones de habitación')]),
      'room_impact', v_room
    );
  END IF;

  IF v_event.date IS NOT NULL THEN
    v_days_to_event := (v_event.date - CURRENT_DATE);
    IF v_days_to_event < v_event.dias_limite_cambio_alumno THEN
      v_status := 'requiere_aprobacion';
      v_warnings := array_append(v_warnings, 'Faltan menos días que el límite permitido para autocambio');
    END IF;
  END IF;

  IF v_clasif = 'estructural' THEN
    v_status := 'requiere_aprobacion';
  END IF;

  v_token := md5(
    p_reservation_id::text || '|' ||
    p_package_nuevo_id::text || '|' ||
    COALESCE(v_precio_nuevo::text,'') || '|' ||
    COALESCE(v_currency_nuevo,'') || '|' ||
    COALESCE(v_precio_actual::text,'') || '|' ||
    COALESCE(v_amount_paid::text,'') || '|' ||
    COALESCE(v_addons_total::text,'') || '|' ||
    COALESCE(v_available_spots::text,'') || '|' ||
    COALESCE(v_status,'') || '|' ||
    COALESCE(v_clasif,'') || '|' ||
    COALESCE(p_price_override::text,'')
  );

  RETURN jsonb_build_object(
    'status', v_status,
    'clasificacion', v_clasif,
    'blockers', to_jsonb(v_blockers),
    'warnings', to_jsonb(v_warnings),
    'package_actual', jsonb_build_object(
      'id', v_pkg_actual.id,
      'nombre', v_pkg_actual.nombre,
      'precio_pagado_reserva', v_precio_actual,
      'precio_pagado', v_precio_actual,
      'personas_por_habitacion', v_pkg_actual.personas_por_habitacion,
      'currency', COALESCE(v_reservation.currency_snapshot, v_event.currency, 'ARS')
    ),
    'package_nuevo', jsonb_build_object(
      'id', v_pkg_nuevo.id,
      'nombre', v_pkg_nuevo.nombre,
      'precio_aplicable', v_precio_nuevo,
      'currency', v_currency_nuevo,
      'stage_id', v_stage_id,
      'stage_nombre', v_stage_nombre,
      'etapa_vigente', v_stage_nombre,
      'price_source', v_price_source,
      'cupos_disponibles', v_available_spots,
      'personas_por_habitacion', v_pkg_nuevo.personas_por_habitacion
    ),
    'amount_paid', v_amount_paid,
    'addons_total', v_addons_total,
    'new_total', v_total_nuevo,
    'difference', v_diff,
    'diferencia', v_diff,
    'credit_to_create', v_credit,
    'credito_a_favor', v_credit,
    'credit_reason', v_credit_reason,
    'credito_reason', v_credit_reason,
    'debit_to_create', v_debit,
    'debito_a_cobrar', v_debit,
    'available_spots', v_available_spots,
    'total_capacity', v_total_capacity,
    'room_impact', v_room,
    'days_to_event', v_days_to_event,
    'revalidation_token', v_token
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_revalidation_token text,
  p_request_id uuid DEFAULT NULL::uuid,
  p_override_plaza_libre boolean DEFAULT false,
  p_admin_note text DEFAULT NULL::text,
  p_price_override numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_preview jsonb;
  v_status text;
  v_credit numeric;
  v_debit numeric;
  v_precio_nuevo numeric;
  v_currency_nuevo text;
  v_reservation record;
  v_event record;
  v_pkg_nuevo record;
  v_is_admin boolean;
  v_adj_id uuid;
  v_relink jsonb;
BEGIN
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());

  IF p_price_override IS NOT NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo un admin puede aplicar un precio manual';
  END IF;

  SELECT * INTO v_reservation
  FROM public.event_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_reservation.event_id;
  SELECT * INTO v_pkg_nuevo FROM public.event_packages WHERE id = p_package_nuevo_id FOR UPDATE;

  v_preview := public.preview_package_change(p_reservation_id, p_package_nuevo_id, NULL, p_price_override);
  v_status := v_preview->>'status';

  IF v_status = 'no_posible' THEN
    RAISE EXCEPTION 'El cambio no es posible: %', v_preview->'blockers';
  END IF;

  IF (v_preview->>'revalidation_token') IS DISTINCT FROM p_revalidation_token THEN
    RAISE EXCEPTION 'El estado del paquete cambió mientras confirmabas. Recargá y volvé a intentar.';
  END IF;

  IF v_status = 'requiere_aprobacion' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Este cambio requiere aprobación admin. Enviá una solicitud.';
  END IF;

  v_credit := COALESCE((v_preview->>'credit_to_create')::numeric, 0);
  v_debit := COALESCE((v_preview->>'debit_to_create')::numeric, 0);
  v_precio_nuevo := (v_preview->'package_nuevo'->>'precio_aplicable')::numeric;
  v_currency_nuevo := v_preview->'package_nuevo'->>'currency';

  INSERT INTO public.reservation_status_history
    (reservation_id, old_reservation_status, new_reservation_status,
     old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (
    p_reservation_id,
    v_reservation.reservation_status,
    v_reservation.reservation_status,
    v_reservation.payment_status,
    v_reservation.payment_status,
    auth.uid(),
    CASE WHEN v_is_admin THEN 'admin' ELSE 'alumno' END,
    CASE WHEN p_price_override IS NOT NULL
         THEN 'Cambio de paquete (precio manual admin)'
         ELSE 'Cambio de paquete'
    END
    || ' · de ' || COALESCE(v_reservation.package_id::text, '—')
    || ' a ' || p_package_nuevo_id::text
    || CASE WHEN p_price_override IS NOT NULL
            THEN ' · precio manual ' || p_price_override::text
            ELSE ''
       END
  );

  UPDATE public.event_reservations
  SET package_id = p_package_nuevo_id,
      package_nombre_snapshot = v_pkg_nuevo.nombre,
      price_snapshot = CASE
        WHEN p_price_override IS NOT NULL THEN v_precio_nuevo
        WHEN v_event.politica_precio_cambio = 'conserva_etapa' THEN v_reservation.price_snapshot
        ELSE v_precio_nuevo
      END,
      currency_snapshot = v_currency_nuevo,
      updated_at = now()
  WHERE id = p_reservation_id;

  PERFORM public.recalculate_reservation_amount_total(p_reservation_id);

  IF v_credit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by, vence_el)
    VALUES (
      p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
      'credito_por_downgrade', v_credit, v_credit, v_currency_nuevo,
      p_request_id, COALESCE(p_admin_note, 'Cambio a paquete más económico'), auth.uid(),
      CASE WHEN v_event.credito_valido_solo_en_evento AND v_event.date IS NOT NULL
           THEN (v_event.date::timestamptz + interval '30 days')
           ELSE NULL END
    )
    RETURNING id INTO v_adj_id;
  ELSIF v_debit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by)
    VALUES (
      p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
      'debito_por_upgrade', v_debit, 0, v_currency_nuevo,
      p_request_id, COALESCE(p_admin_note, 'Cambio a paquete de mayor valor'), auth.uid()
    )
    RETURNING id INTO v_adj_id;
  END IF;

  IF p_request_id IS NOT NULL THEN
    UPDATE public.event_package_change_requests
    SET estado = 'aplicada',
        applied_at = now(),
        resolved_at = COALESCE(resolved_at, now()),
        resolved_by = COALESCE(resolved_by, auth.uid()),
        override_plaza_libre = p_override_plaza_libre,
        nota_admin = COALESCE(nota_admin, p_admin_note)
    WHERE id = p_request_id;
  END IF;

  BEGIN
    INSERT INTO public.student_activity_log
      (alumno_id, event_type, title, description, actor_id, actor_role, reference_type, reference_id)
    VALUES (
      v_reservation.alumno_id,
      'package_change',
      'Cambio de paquete aplicado',
      'De ' || COALESCE(v_reservation.package_nombre_snapshot,'—') || ' a ' || v_pkg_nuevo.nombre
        || CASE WHEN p_price_override IS NOT NULL THEN ' (precio manual)' ELSE '' END,
      auth.uid(),
      CASE WHEN v_is_admin THEN 'admin' ELSE 'alumno' END,
      'event_reservation',
      p_reservation_id
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_relink := public.relink_reservation_payment_plan(
    p_reservation_id,
    'Cambio de paquete: re-vinculación de plan'
  );

  PERFORM public.rebalance_reservation_installments(p_reservation_id);
  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', p_reservation_id,
    'new_package_id', p_package_nuevo_id,
    'adjustment_id', v_adj_id,
    'credit_created', v_credit,
    'debit_created', v_debit,
    'price_source', v_preview->'package_nuevo'->>'price_source',
    'payment_plan_relink', v_relink,
    'warning', v_relink->>'warning'
  );
END;
$function$;
