CREATE OR REPLACE FUNCTION public.preview_package_change(p_reservation_id uuid, p_package_nuevo_id uuid, p_roommate_propuesto_id uuid DEFAULT NULL::uuid, p_price_override numeric DEFAULT NULL::numeric)
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
BEGIN
  SELECT * INTO v_reservation FROM public.event_reservations WHERE id = p_reservation_id;
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

  SELECT COALESCE(SUM(capacidad), 0) INTO v_total_capacity
    FROM public.event_rooms WHERE package_id = p_package_nuevo_id;
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
  END IF;

  v_precio_actual := COALESCE(v_reservation.price_snapshot, v_pkg_actual.precio, 0);
  v_amount_paid := COALESCE(v_reservation.amount_paid, 0);
  v_diff := v_precio_nuevo - v_precio_actual;

  IF v_diff < 0 THEN
    v_credit := GREATEST(0, v_amount_paid - v_precio_nuevo);
    IF v_credit > 0 THEN
      v_credit_reason := 'El cliente pagó ' || v_amount_paid::text ||
                        ' y el paquete nuevo cuesta ' || v_precio_nuevo::text ||
                        '. La diferencia queda como crédito a favor.';
      v_warnings := array_append(v_warnings, 'Se generará un crédito por el excedente pagado');
    ELSE
      v_credit_reason := 'No se genera crédito: lo pagado no supera el precio del paquete nuevo. Se recalculan las cuotas pendientes al nuevo total.';
      v_warnings := array_append(v_warnings, 'Sin crédito: se recalculan las cuotas pendientes al nuevo precio');
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

  v_token := encode(gen_random_bytes(16), 'hex');

  RETURN jsonb_build_object(
    'status', v_status,
    'blockers', to_jsonb(v_blockers),
    'warnings', to_jsonb(v_warnings),
    'package_actual', jsonb_build_object(
      'id', v_pkg_actual.id,
      'nombre', v_pkg_actual.nombre,
      'precio_pagado', v_precio_actual,
      'currency', COALESCE(v_reservation.currency_snapshot, v_event.currency, 'ARS')
    ),
    'package_nuevo', jsonb_build_object(
      'id', v_pkg_nuevo.id,
      'nombre', v_pkg_nuevo.nombre,
      'precio_aplicable', v_precio_nuevo,
      'currency', v_currency_nuevo,
      'stage_id', v_stage_id,
      'stage_nombre', v_stage_nombre,
      'price_source', v_price_source
    ),
    'amount_paid', v_amount_paid,
    'diferencia', v_diff,
    'credito_a_favor', v_credit,
    'credito_reason', v_credit_reason,
    'debito_a_cobrar', v_debit,
    'available_spots', v_available_spots,
    'total_capacity', v_total_capacity,
    'room_impact', v_room,
    'clasificacion', v_clasif,
    'days_to_event', v_days_to_event,
    'revalidation_token', v_token
  );
END;
$function$;