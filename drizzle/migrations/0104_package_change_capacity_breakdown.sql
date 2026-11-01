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
  v_addons_total numeric := 0;
  v_total_nuevo numeric := 0;
  v_effective_start date;
  v_assigned integer := 0;
  v_unassigned integer := 0;
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
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
  SELECT COALESCE(c.proposed_start, v_event.date) INTO v_effective_start
  FROM (SELECT 1) x
  LEFT JOIN public.event_rescheduling_campaigns c
    ON c.event_id = v_event.id AND c.public_enabled = true AND c.proposed_start IS NOT NULL;
  IF v_effective_start IS NULL THEN v_effective_start := v_event.date; END IF;

  IF v_event.bloquear_cambios_despues_de_inicio
     AND v_effective_start IS NOT NULL AND v_effective_start <= v_today THEN
    v_blockers := array_append(v_blockers, 'El evento ya inició; solicitá cambios manuales al admin');
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_package_change_requests
             WHERE reservation_id = p_reservation_id AND estado = 'pendiente') THEN
    v_blockers := array_append(v_blockers, 'Ya tenés una solicitud pendiente para esta reserva');
  END IF;

  SELECT COALESCE(SUM(capacidad), 0) INTO v_total_capacity
  FROM public.event_rooms WHERE package_id = p_package_nuevo_id;

  v_available_spots := public.get_package_available_spots(p_package_nuevo_id);

  IF p_package_nuevo_id <> COALESCE(v_reservation.package_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    IF v_total_capacity = 0 THEN
      v_blockers := array_append(v_blockers, 'El paquete destino no tiene habitaciones cargadas en Alojamiento — cargá al menos una para poder venderlo');
    ELSIF v_available_spots <= 0 THEN
      SELECT COUNT(*) INTO v_assigned FROM public.event_room_assignments era
        JOIN public.event_rooms er ON er.id = era.room_id
        JOIN public.event_reservations res ON res.id = era.reservation_id
       WHERE er.package_id = p_package_nuevo_id AND res.reservation_status NOT IN ('cancelada','rechazada','expirada');
      SELECT COUNT(*) INTO v_unassigned FROM public.event_reservations res
       WHERE res.package_id = p_package_nuevo_id AND res.id <> p_reservation_id
         AND res.reservation_status NOT IN ('cancelada','rechazada','expirada')
         AND NOT EXISTS (SELECT 1 FROM public.event_room_assignments era WHERE era.reservation_id = res.id)
         AND NOT EXISTS (SELECT 1 FROM public.rescheduling_seat_releases s WHERE s.source_reservation_id = res.id AND s.state IN ('liberada','ofrecida','ocupada'));
      v_blockers := array_append(v_blockers, format(
        'Sin cupo comercial en el paquete destino: %s plazas físicas, %s con persona asignada y %s reserva(s) activa(s) sin habitación que ya ocupan cupo%s',
        v_total_capacity, v_assigned, v_unassigned,
        CASE WHEN v_total_capacity - v_assigned > 0
          THEN format('. Hay %s habitación(es) físicamente libre(s), pero están comprometidas por esas reservas sin habitación; revisá Alojamiento', v_total_capacity - v_assigned)
          ELSE '' END));
    END IF;
  END IF;

  IF array_length(v_blockers,1) > 0 THEN
    RETURN jsonb_build_object('status','no_posible','blockers', to_jsonb(v_blockers),
      'package_actual', to_jsonb(v_pkg_actual),'package_nuevo', to_jsonb(v_pkg_nuevo));
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
    IF v_stage_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.event_package_price_stages s
         WHERE s.id = v_stage_id AND s.vigente_desde <= now()
           AND (s.vigente_hasta IS NULL OR s.vigente_hasta > now())) THEN
      v_price_source := 'stage_carry_forward';
    END IF;
  END IF;

  v_precio_actual := COALESCE(v_reservation.price_snapshot, v_pkg_actual.precio, 0);
  v_amount_paid := COALESCE(v_reservation.amount_paid, 0);
  v_diff := v_precio_nuevo - v_precio_actual;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_addons_total
  FROM public.reservation_addons WHERE reservation_id = p_reservation_id;

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
      RETURN jsonb_build_object('status','no_posible','blockers', to_jsonb(ARRAY['Este evento no permite bajar de paquete']));
    END IF;
  ELSIF v_diff > 0 THEN
    v_debit := v_diff;
    v_warnings := array_append(v_warnings, 'Se recalculan las cuotas pendientes con la diferencia');
  END IF;

  v_room := public.evaluate_room_impact(p_reservation_id, p_package_nuevo_id, p_roommate_propuesto_id);
  v_clasif := public.classify_package_change(p_reservation_id, p_package_nuevo_id, v_room);

  IF (v_room->>'status') = 'no_posible' THEN
    RETURN jsonb_build_object('status','no_posible',
      'blockers', to_jsonb(ARRAY['El cambio no es posible: ' || COALESCE((v_room->'razones'->>0), 'razones de habitación')]),
      'room_impact', v_room);
  END IF;

  IF v_effective_start IS NOT NULL THEN
    v_days_to_event := (v_effective_start - v_today);
    IF v_days_to_event < v_event.dias_limite_cambio_alumno THEN
      v_status := 'requiere_aprobacion';
      v_warnings := array_append(v_warnings, 'Faltan menos días que el límite permitido para autocambio');
    END IF;
  END IF;

  IF v_clasif = 'estructural' THEN
    v_status := 'requiere_aprobacion';
  END IF;

  v_token := md5(
    p_reservation_id::text || '|' || p_package_nuevo_id::text || '|' ||
    COALESCE(v_precio_nuevo::text,'') || '|' || COALESCE(v_currency_nuevo,'') || '|' ||
    COALESCE(v_precio_actual::text,'') || '|' || COALESCE(v_amount_paid::text,'') || '|' ||
    COALESCE(v_addons_total::text,'') || '|' || COALESCE(v_available_spots::text,'') || '|' ||
    COALESCE(v_status,'') || '|' || COALESCE(v_clasif,'') || '|' || COALESCE(p_price_override::text,''));

  RETURN jsonb_build_object(
    'status', v_status, 'clasificacion', v_clasif,
    'blockers', to_jsonb(v_blockers), 'warnings', to_jsonb(v_warnings),
    'package_actual', jsonb_build_object('id', v_pkg_actual.id,'nombre', v_pkg_actual.nombre,
      'precio_pagado_reserva', v_precio_actual,'precio_pagado', v_precio_actual,
      'personas_por_habitacion', v_pkg_actual.personas_por_habitacion,
      'currency', COALESCE(v_reservation.currency_snapshot, v_event.currency, 'ARS')),
    'package_nuevo', jsonb_build_object('id', v_pkg_nuevo.id,'nombre', v_pkg_nuevo.nombre,
      'precio_aplicable', v_precio_nuevo,'currency', v_currency_nuevo,'stage_id', v_stage_id,
      'stage_nombre', v_stage_nombre,'etapa_vigente', v_stage_nombre,'price_source', v_price_source,
      'cupos_disponibles', v_available_spots,'personas_por_habitacion', v_pkg_nuevo.personas_por_habitacion),
    'amount_paid', v_amount_paid, 'addons_total', v_addons_total, 'new_total', v_total_nuevo,
    'difference', v_diff, 'diferencia', v_diff,
    'credit_to_create', v_credit, 'credito_a_favor', v_credit,
    'credit_reason', v_credit_reason, 'credito_reason', v_credit_reason,
    'debit_to_create', v_debit, 'debito_a_cobrar', v_debit,
    'available_spots', v_available_spots, 'total_capacity', v_total_capacity,
    'room_impact', v_room, 'days_to_event', v_days_to_event,
    'effective_start', v_effective_start,
    'revalidation_token', v_token);
END;
$function$;