
-- ---------------------------------------------------------------------------
-- rebalance_reservation_installments
-- Redistribuye proporcionalmente el saldo pendiente de la reserva entre las
-- cuotas todavía impagas. Preserva paid_amount y fechas. Última cuota
-- pendiente absorbe el redondeo. Si todo el saldo ya está pagado, deja las
-- pendientes en 0. Devuelve la cantidad de cuotas modificadas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebalance_reservation_installments(p_reservation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount_total numeric;
  v_amount_paid numeric;
  v_new_pending numeric;
  v_current_remaining numeric := 0;
  v_scaled_accum numeric := 0;
  v_touched integer := 0;
  v_last_id uuid;
  r record;
  v_new_amount numeric;
  v_new_remaining numeric;
  v_currency text;
BEGIN
  SELECT COALESCE(amount_total, 0), COALESCE(amount_paid, 0),
         COALESCE(currency_snapshot, moneda, 'ARS')
    INTO v_amount_total, v_amount_paid, v_currency
  FROM public.event_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_new_pending := ROUND(GREATEST(v_amount_total - v_amount_paid, 0)::numeric, 2);

  -- Suma del saldo pendiente actual entre cuotas no cerradas
  SELECT COALESCE(SUM(GREATEST(amount - paid_amount, 0)), 0)
    INTO v_current_remaining
  FROM public.reservation_installments
  WHERE reservation_id = p_reservation_id
    AND status NOT IN ('pagada', 'condonada');

  -- Última cuota pendiente (para absorber redondeo)
  SELECT id INTO v_last_id
  FROM public.reservation_installments
  WHERE reservation_id = p_reservation_id
    AND status NOT IN ('pagada', 'condonada')
  ORDER BY sort_order DESC, installment_number DESC
  LIMIT 1;

  IF v_last_id IS NULL THEN
    -- No hay cuotas para rebalancear (todo pagado o sin plan materializado)
    PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);
    RETURN 0;
  END IF;

  -- Caso especial: no hay saldo remanente actual pero sí nuevo pendiente,
  -- o viceversa. Distribuimos parejo entre las cuotas pendientes.
  IF v_current_remaining <= 0 THEN
    FOR r IN
      SELECT id, amount, paid_amount
      FROM public.reservation_installments
      WHERE reservation_id = p_reservation_id
        AND status NOT IN ('pagada', 'condonada')
      ORDER BY sort_order, installment_number
    LOOP
      IF r.id = v_last_id THEN
        v_new_remaining := ROUND(v_new_pending - v_scaled_accum, 2);
      ELSE
        v_new_remaining := 0; -- será ajustado en la última
      END IF;
      v_new_amount := ROUND(r.paid_amount + GREATEST(v_new_remaining, 0), 2);
      UPDATE public.reservation_installments
        SET amount = v_new_amount,
            balance_due = GREATEST(v_new_amount - r.paid_amount, 0),
            currency = v_currency,
            status = CASE
              WHEN v_new_amount <= r.paid_amount THEN 'pagada'
              WHEN r.paid_amount > 0 THEN 'parcial'
              ELSE 'pendiente'
            END,
            updated_at = now()
        WHERE id = r.id;
      v_scaled_accum := v_scaled_accum + v_new_remaining;
      v_touched := v_touched + 1;
    END LOOP;
  ELSE
    FOR r IN
      SELECT id, amount, paid_amount
      FROM public.reservation_installments
      WHERE reservation_id = p_reservation_id
        AND status NOT IN ('pagada', 'condonada')
      ORDER BY sort_order, installment_number
    LOOP
      IF r.id = v_last_id THEN
        v_new_remaining := ROUND(v_new_pending - v_scaled_accum, 2);
        IF v_new_remaining < 0 THEN v_new_remaining := 0; END IF;
      ELSE
        v_new_remaining := ROUND(
          GREATEST(r.amount - r.paid_amount, 0) * v_new_pending / v_current_remaining,
          2
        );
      END IF;
      v_new_amount := ROUND(r.paid_amount + v_new_remaining, 2);
      UPDATE public.reservation_installments
        SET amount = v_new_amount,
            balance_due = GREATEST(v_new_amount - r.paid_amount, 0),
            currency = v_currency,
            status = CASE
              WHEN v_new_amount <= r.paid_amount AND r.paid_amount > 0 THEN 'pagada'
              WHEN r.paid_amount > 0 THEN 'parcial'
              ELSE 'pendiente'
            END,
            updated_at = now()
        WHERE id = r.id;
      v_scaled_accum := v_scaled_accum + v_new_remaining;
      v_touched := v_touched + 1;
    END LOOP;
  END IF;

  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);
  RETURN v_touched;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebalance_reservation_installments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebalance_reservation_installments(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- apply_package_change: al final, rebalancear las cuotas
-- ---------------------------------------------------------------------------
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

  -- Rebalancear el plan de cuotas al nuevo precio
  BEGIN
    PERFORM public.rebalance_reservation_installments(p_reservation_id);
  EXCEPTION WHEN OTHERS THEN
    -- No es fatal: dejamos el cambio aplicado aunque falle el rebalance
    NULL;
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

-- Rebalancear todas las reservas con cambios de paquete ya aplicados que aún
-- tengan cuotas descuadradas respecto al total actual.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT er.id
    FROM public.event_reservations er
    WHERE EXISTS (
      SELECT 1 FROM public.reservation_installments ri
      WHERE ri.reservation_id = er.id
    )
    AND EXISTS (
      SELECT 1 FROM public.reservation_financial_adjustments a
      WHERE a.reservation_id = er.id
        AND a.tipo IN ('credito_por_downgrade', 'debito_por_upgrade')
    )
  LOOP
    BEGIN
      PERFORM public.rebalance_reservation_installments(r.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
