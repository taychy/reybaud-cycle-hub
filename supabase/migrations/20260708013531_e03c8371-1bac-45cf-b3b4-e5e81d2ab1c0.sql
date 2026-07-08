
-- ============================================================
-- Herramientas admin para reservas de viajes:
--  1) Reasignar pago a otra cuota
--  2) Imputar pagos huérfanos a cuotas recién materializadas
--  3) Cambio de paquete: override de precio (etapa o manual)
-- ============================================================

-- ------------------------------------------------------------
-- 1) reassign_payment_to_installment
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_payment_to_installment(
  p_payment_id uuid,
  p_target_installment_id uuid,
  p_admin_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_payment record;
  v_target record;
  v_source_id uuid;
  v_reservation_id uuid;
BEGIN
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo un admin puede reasignar pagos';
  END IF;

  SELECT * INTO v_payment FROM public.reservation_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_payment.status <> 'validado' THEN
    RAISE EXCEPTION 'Solo se pueden reasignar pagos validados (estado actual: %)', v_payment.status;
  END IF;

  SELECT * INTO v_target FROM public.reservation_installments WHERE id = p_target_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuota destino no encontrada'; END IF;

  v_reservation_id := v_payment.reservation_id;
  IF v_target.reservation_id <> v_reservation_id THEN
    RAISE EXCEPTION 'La cuota destino pertenece a otra reserva';
  END IF;

  v_source_id := v_payment.installment_id;
  IF v_source_id = p_target_installment_id THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  -- Reapuntar el pago
  UPDATE public.reservation_payments
     SET installment_id = p_target_installment_id,
         installment_number = v_target.installment_number
   WHERE id = p_payment_id;

  -- Si la cuota origen tenía condonación fantasma exactamente por el monto del pago,
  -- limpiarla (caso Suanni). Esto es una limpieza defensiva; no crítica.
  IF v_source_id IS NOT NULL THEN
    UPDATE public.reservation_installments
       SET condoned_amount = NULL,
           condoned_at = NULL,
           condoned_by = NULL,
           updated_at = now()
     WHERE id = v_source_id
       AND COALESCE(condoned_amount, 0) = v_payment.amount
       AND condoned_by IS NOT NULL;
  END IF;

  -- Recalcula ambas cuotas y totales
  PERFORM public.recalculate_reservation_payment_totals(v_reservation_id);

  -- Historial
  BEGIN
    IF v_source_id IS NOT NULL THEN
      INSERT INTO public.reservation_installment_history
        (reservation_installment_id, reservation_id, action, payment_id,
         previous_installment_id, new_installment_id, reason, changed_by,
         before, after)
      VALUES (v_source_id, v_reservation_id, 'payment_removed', p_payment_id,
              v_source_id, p_target_installment_id,
              COALESCE(p_admin_note, 'Pago reasignado a otra cuota'), auth.uid(),
              jsonb_build_object('amount', v_payment.amount),
              jsonb_build_object('moved_to', p_target_installment_id));
    END IF;

    INSERT INTO public.reservation_installment_history
      (reservation_installment_id, reservation_id, action, payment_id,
       previous_installment_id, new_installment_id, reason, changed_by,
       before, after)
    VALUES (p_target_installment_id, v_reservation_id, 'payment_reassigned', p_payment_id,
            v_source_id, p_target_installment_id,
            COALESCE(p_admin_note, 'Pago reasignado a esta cuota'), auth.uid(),
            jsonb_build_object('amount', v_payment.amount),
            jsonb_build_object('from', v_source_id, 'to', p_target_installment_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', p_payment_id,
    'from_installment_id', v_source_id,
    'to_installment_id', p_target_installment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_payment_to_installment(uuid, uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 2) impute_validated_payments_to_installments
--    Toma pagos validados sin cuota asignada (o con installment_id
--    apuntando a cuota inexistente/otra reserva) y los imputa en
--    orden de sort_order hasta llenar el saldo de cada cuota.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.impute_validated_payments_to_installments(
  p_reservation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_pay record;
  v_inst record;
  v_remaining numeric;
  v_alloc numeric;
  v_assigned integer := 0;
BEGIN
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo admin puede imputar pagos';
  END IF;

  FOR v_pay IN
    SELECT rp.*
      FROM public.reservation_payments rp
     WHERE rp.reservation_id = p_reservation_id
       AND rp.status = 'validado'
       AND (
         rp.installment_id IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM public.reservation_installments ri
            WHERE ri.id = rp.installment_id
              AND ri.reservation_id = p_reservation_id
         )
       )
     ORDER BY rp.payment_date NULLS LAST, rp.created_at
  LOOP
    v_remaining := v_pay.amount;
    FOR v_inst IN
      SELECT id, sort_order, installment_number, amount,
             COALESCE(paid_amount, 0) AS paid_amount,
             COALESCE(condoned_amount, 0) AS condoned_amount
        FROM public.reservation_installments
       WHERE reservation_id = p_reservation_id
       ORDER BY sort_order NULLS LAST, installment_number
    LOOP
      v_alloc := GREATEST(0, v_inst.amount - v_inst.paid_amount - v_inst.condoned_amount);
      IF v_alloc <= 0 THEN CONTINUE; END IF;
      IF v_alloc >= v_remaining THEN
        -- Imputa TODO el pago aquí
        UPDATE public.reservation_payments
           SET installment_id = v_inst.id,
               installment_number = v_inst.installment_number
         WHERE id = v_pay.id;
        v_assigned := v_assigned + 1;
        v_remaining := 0;
        EXIT;
      ELSE
        -- Un pago se asigna a UNA sola cuota; si excede el saldo,
        -- se asigna igual a esa cuota (queda en historial pero
        -- para simplicidad no dividimos pagos entre cuotas).
        UPDATE public.reservation_payments
           SET installment_id = v_inst.id,
               installment_number = v_inst.installment_number
         WHERE id = v_pay.id;
        v_assigned := v_assigned + 1;
        v_remaining := 0;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);

  RETURN jsonb_build_object('ok', true, 'assigned', v_assigned);
END;
$$;

GRANT EXECUTE ON FUNCTION public.impute_validated_payments_to_installments(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3) preview_package_change - agrega p_price_override
--    Mantiene compatibilidad: si viene NULL usa la etapa vigente.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.preview_package_change(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.preview_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_roommate_propuesto_id uuid DEFAULT NULL,
  p_price_override numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_amount_paid numeric;
  v_diff numeric;
  v_credit numeric := 0;
  v_debit numeric := 0;
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

  v_available_spots := public.get_package_available_spots(p_package_nuevo_id);
  IF v_available_spots <= 0 AND p_package_nuevo_id <> COALESCE(v_reservation.package_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    v_blockers := array_append(v_blockers, 'El paquete destino no tiene cupos disponibles');
  END IF;

  IF array_length(v_blockers,1) > 0 THEN
    RETURN jsonb_build_object(
      'status','no_posible',
      'blockers', to_jsonb(v_blockers),
      'package_actual', to_jsonb(v_pkg_actual),
      'package_nuevo', to_jsonb(v_pkg_nuevo)
    );
  END IF;

  -- Precio: manual > stage_vigente
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
    v_credit := ABS(v_diff);
    v_warnings := array_append(v_warnings, 'Se generará un crédito dentro del evento por la diferencia');
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
      v_warnings := array_append(v_warnings,
        'Estamos dentro de los ' || v_event.dias_limite_cambio_alumno || ' días previos: requiere aprobación admin');
    END IF;
  END IF;

  IF v_credit > 0 AND v_amount_paid > 0 THEN
    v_status := 'requiere_aprobacion';
  END IF;
  IF (v_room->>'status') = 'requiere_aprobacion' THEN
    v_status := 'requiere_aprobacion';
  END IF;

  v_token := md5(
    p_reservation_id::text || '|' ||
    p_package_nuevo_id::text || '|' ||
    v_available_spots::text || '|' ||
    v_precio_nuevo::text || '|' ||
    COALESCE(v_stage_id::text,'') || '|' ||
    v_price_source || '|' ||
    v_reservation.updated_at::text
  );

  RETURN jsonb_build_object(
    'status', v_status,
    'clasificacion', v_clasif,
    'package_actual', jsonb_build_object(
      'id', v_pkg_actual.id,
      'nombre', v_pkg_actual.nombre,
      'precio_pagado_reserva', v_precio_actual,
      'personas_por_habitacion', v_pkg_actual.personas_por_habitacion
    ),
    'package_nuevo', jsonb_build_object(
      'id', v_pkg_nuevo.id,
      'nombre', v_pkg_nuevo.nombre,
      'precio_aplicable', v_precio_nuevo,
      'currency', v_currency_nuevo,
      'etapa_vigente', v_stage_nombre,
      'cupos_disponibles', v_available_spots,
      'personas_por_habitacion', v_pkg_nuevo.personas_por_habitacion
    ),
    'politica_precio_aplicada', v_event.politica_precio_cambio,
    'price_source', v_price_source,
    'amount_paid', v_amount_paid,
    'difference', v_diff,
    'credit_to_create', v_credit,
    'debit_to_create', v_debit,
    'room_impact', v_room,
    'warnings', to_jsonb(v_warnings),
    'blockers', to_jsonb(ARRAY[]::text[]),
    'revalidation_token', v_token,
    'days_to_event', v_days_to_event
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_package_change(uuid, uuid, uuid, numeric) TO authenticated;

-- ------------------------------------------------------------
-- 4) apply_package_change - agrega p_price_override
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_package_change(uuid, uuid, text, uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.apply_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_revalidation_token text,
  p_request_id uuid DEFAULT NULL,
  p_override_plaza_libre boolean DEFAULT false,
  p_admin_note text DEFAULT NULL,
  p_price_override numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());

  IF p_price_override IS NOT NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo un admin puede aplicar un precio manual';
  END IF;

  SELECT * INTO v_reservation FROM public.event_reservations
    WHERE id = p_reservation_id FOR UPDATE;
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

  BEGIN
    INSERT INTO public.reservation_status_history
      (reservation_id, previous_status, new_status, changed_by, reason, metadata)
    VALUES (p_reservation_id, v_reservation.reservation_status, v_reservation.reservation_status,
            auth.uid(),
            CASE WHEN p_price_override IS NOT NULL THEN 'Cambio de paquete (precio manual admin)' ELSE 'Cambio de paquete' END,
            jsonb_build_object('preview', v_preview, 'package_actual', v_reservation.package_id,
                               'price_override', p_price_override));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  UPDATE public.event_reservations SET
    package_id = p_package_nuevo_id,
    package_nombre_snapshot = v_pkg_nuevo.nombre,
    price_snapshot = CASE
      WHEN p_price_override IS NOT NULL THEN v_precio_nuevo
      WHEN v_event.politica_precio_cambio = 'conserva_etapa' THEN v_reservation.price_snapshot
      ELSE v_precio_nuevo
    END,
    currency_snapshot = v_currency_nuevo,
    amount_total = CASE
      WHEN p_price_override IS NOT NULL THEN v_precio_nuevo
      WHEN v_event.politica_precio_cambio = 'conserva_etapa' THEN v_reservation.amount_total
      ELSE v_precio_nuevo
    END,
    balance_due = GREATEST(v_precio_nuevo - v_reservation.amount_paid, 0),
    updated_at = now()
  WHERE id = p_reservation_id;

  IF v_credit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by, vence_el)
    VALUES (p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
            'credito_por_downgrade', v_credit, v_credit, v_currency_nuevo,
            p_request_id, COALESCE(p_admin_note, 'Cambio a paquete más económico'), auth.uid(),
            CASE WHEN v_event.credito_valido_solo_en_evento
                 AND v_event.date IS NOT NULL
                 THEN (v_event.date::timestamptz + interval '30 days')
                 ELSE NULL END)
    RETURNING id INTO v_adj_id;
  ELSIF v_debit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by)
    VALUES (p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
            'debito_por_upgrade', v_debit, 0, v_currency_nuevo,
            p_request_id, COALESCE(p_admin_note, 'Cambio a paquete de mayor valor'), auth.uid())
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
    VALUES (v_reservation.alumno_id, 'package_change',
            'Cambio de paquete aplicado',
            'De ' || COALESCE(v_reservation.package_nombre_snapshot,'—') || ' a ' || v_pkg_nuevo.nombre
              || CASE WHEN p_price_override IS NOT NULL THEN ' (precio manual)' ELSE '' END,
            auth.uid(),
            CASE WHEN v_is_admin THEN 'admin' ELSE 'alumno' END,
            'event_reservation', p_reservation_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', p_reservation_id,
    'new_package_id', p_package_nuevo_id,
    'adjustment_id', v_adj_id,
    'credit_created', v_credit,
    'debit_created', v_debit,
    'price_source', v_preview->>'price_source'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_package_change(uuid, uuid, text, uuid, boolean, text, numeric) TO authenticated;
