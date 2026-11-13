-- 0112 (PENDIENTE, no aplicada): sincronización transaccional de reserva + cuotas
-- ante pagos Mercado Pago de eventos (generales "event:<id>" o de cuota "event:<id>:inst:<n>").
-- No modifica filas existentes al aplicarse: sólo redefine funciones. Sin barridos.

-- 1) Recalculo canónico: excluye pagos anulados, respeta destino explícito
--    (installment_id) antes de distribuir los generales por orden de cuota,
--    y sincroniza los campos espejo monto_pagado / saldo_pendiente.
CREATE OR REPLACE FUNCTION public.recalculate_reservation_payment_totals(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  CREATE TEMP TABLE IF NOT EXISTS _rrpt_pay (installment_id uuid, eq numeric) ON COMMIT DROP;
  TRUNCATE _rrpt_pay;
  INSERT INTO _rrpt_pay
  SELECT p.installment_id,
         COALESCE(p.equivalent_amount_event_currency,
                  CASE WHEN COALESCE(p.currency, v_event_currency) = v_event_currency THEN p.amount END,
                  0)
    FROM public.reservation_payments p
   WHERE p.reservation_id = p_reservation_id
     AND p.status = 'validado'
     AND p.anulado_at IS NULL;

  SELECT COALESCE(SUM(eq), 0) INTO v_amount_paid FROM _rrpt_pay;

  SELECT COALESCE(SUM(condoned_amount), 0)
    INTO v_condoned_total
  FROM public.reservation_installments
  WHERE reservation_id = p_reservation_id;

  SELECT amount_total, payment_status
    INTO v_amount_total, v_old_status
  FROM public.event_reservations
  WHERE id = p_reservation_id;

  v_amount_total := COALESCE(v_amount_total, 0);
  v_balance := GREATEST(v_amount_total - v_amount_paid - v_condoned_total, 0);

  IF v_amount_total <= 0 THEN
    v_new_status := COALESCE(v_old_status, 'no_aplica');
  ELSIF (v_amount_paid + v_condoned_total) <= 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.reservation_payments
      WHERE reservation_id = p_reservation_id AND status = 'informado' AND anulado_at IS NULL
    ) THEN
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
  SET amount_paid    = v_amount_paid,
      balance_due    = v_balance,
      payment_status = v_new_status,
      updated_at     = now()
  WHERE id = p_reservation_id;

  -- Pagos con destino explícito a una cuota vigente se aplican primero a esa cuota;
  -- el excedente y los pagos generales forman el pool que se distribuye por orden.
  CREATE TEMP TABLE IF NOT EXISTS _rrpt_alloc (id uuid PRIMARY KEY, owe numeric, applied numeric) ON COMMIT DROP;
  TRUNCATE _rrpt_alloc;
  INSERT INTO _rrpt_alloc
  SELECT ri.id,
         GREATEST(ri.amount - COALESCE(ri.condoned_amount, 0), 0),
         LEAST(GREATEST(ri.amount - COALESCE(ri.condoned_amount, 0), 0),
               COALESCE((SELECT SUM(eq) FROM _rrpt_pay x WHERE x.installment_id = ri.id), 0))
    FROM public.reservation_installments ri
   WHERE ri.reservation_id = p_reservation_id
     AND ri.status IS DISTINCT FROM 'reprogramada'
     AND COALESCE(ri.condoned_amount, 0) < ri.amount;

  SELECT v_amount_paid - COALESCE(SUM(applied), 0) INTO v_pool FROM _rrpt_alloc;
  v_pool := GREATEST(v_pool, 0);

  FOR v_inst IN
    SELECT id, amount, COALESCE(condoned_amount, 0) AS condoned_amount,
           installment_number, status
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
      SET paid_amount = 0, monto_pagado = 0,
          balance_due = 0, saldo_pendiente = 0,
          status = 'condonada',
          updated_at = now()
      WHERE id = v_inst.id;
      CONTINUE;
    END IF;

    SELECT owe, applied INTO v_owe, v_spec FROM _rrpt_alloc WHERE id = v_inst.id;
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
        status = v_status,
        updated_at = now()
    WHERE id = v_inst.id;
  END LOOP;
END;
$function$;

-- 2) Registro atómico e idempotente del webhook MP de eventos.
CREATE OR REPLACE FUNCTION public.register_event_mp_payment(
  p_reservation_id uuid,
  p_mp_payment_id text,
  p_mp_status text,
  p_amount numeric,
  p_installment_number integer DEFAULT NULL,
  p_payment_date date DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res record;
  v_after record;
  v_existing record;
  v_status text;
  v_action text;
  v_payment_id uuid;
  v_inst_id uuid;
  v_became_validated boolean := false;
  v_currency text;
BEGIN
  IF p_reservation_id IS NULL OR NULLIF(btrim(p_mp_payment_id), '') IS NULL THEN
    RAISE EXCEPTION 'register_event_mp_payment: reserva y pago MP son obligatorios';
  END IF;

  v_status := CASE p_mp_status
    WHEN 'approved' THEN 'validado'
    WHEN 'rejected' THEN 'rechazado'
    WHEN 'cancelled' THEN 'rechazado'
    WHEN 'pending' THEN 'informado'
    WHEN 'in_process' THEN 'informado'
    WHEN 'authorized' THEN 'informado'
    ELSE NULL END;  -- refunded / charged_back / otros: nunca se revierten automáticamente

  -- Serializa por operación MP (también entre reservas) y por reserva.
  PERFORM pg_advisory_xact_lock(hashtextextended('event_mp_payment:' || p_mp_payment_id, 0));
  SELECT * INTO v_res FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'action', 'missing_reservation');
  END IF;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'action', 'status_ignored', 'mp_status', p_mp_status);
  END IF;

  -- La misma operación ya representada en OTRA reserva: no duplicar ingreso.
  IF EXISTS (
    SELECT 1 FROM public.reservation_payments
     WHERE reservation_id <> p_reservation_id AND anulado_at IS NULL
       AND (mp_payment_id = p_mp_payment_id OR payment_reference = p_mp_payment_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'action', 'conflict_other_reservation');
  END IF;

  SELECT * INTO v_existing FROM public.reservation_payments
   WHERE reservation_id = p_reservation_id AND anulado_at IS NULL
     AND (mp_payment_id = p_mp_payment_id OR payment_reference = p_mp_payment_id)
   ORDER BY created_at, id LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    v_payment_id := v_existing.id;
    IF v_existing.status = v_status THEN
      v_action := 'duplicate';
    ELSIF v_existing.status = 'informado' AND v_status IN ('validado', 'rechazado') THEN
      IF v_status = 'validado' AND p_amount IS NOT NULL AND round(v_existing.amount, 2) <> round(p_amount, 2) THEN
        RETURN jsonb_build_object('ok', false, 'action', 'amount_mismatch', 'payment_id', v_payment_id);
      END IF;
      UPDATE public.reservation_payments
         SET status = v_status,
             mp_payment_id = COALESCE(mp_payment_id, p_mp_payment_id),
             review_action = 'mp_webhook',
             reviewed_at = now(),
             notes = COALESCE(notes || ' · ', '') || 'Mercado Pago: ' || p_mp_status
       WHERE id = v_payment_id;
      v_action := 'transitioned';
      v_became_validated := v_status = 'validado';
    ELSE
      v_action := 'final_state_kept';  -- validado/rechazado no se reabren desde el webhook
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.reservation_payments
     WHERE reservation_id = p_reservation_id AND anulado_at IS NOT NULL
       AND (mp_payment_id = p_mp_payment_id OR payment_reference = p_mp_payment_id)
  ) THEN
    RETURN jsonb_build_object('ok', true, 'action', 'annulled_kept');
  ELSE
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RAISE EXCEPTION 'register_event_mp_payment: importe inválido';
    END IF;
    IF p_installment_number IS NOT NULL THEN
      SELECT id INTO v_inst_id FROM public.reservation_installments
       WHERE reservation_id = p_reservation_id AND installment_number = p_installment_number
       ORDER BY created_at LIMIT 1;
    END IF;
    v_currency := COALESCE(v_res.currency_snapshot, v_res.moneda, 'ARS');
    INSERT INTO public.reservation_payments (
      reservation_id, alumno_id, amount, currency, payment_date, payment_method,
      payment_reference, mp_payment_id, notes, status, installment_id, installment_number
    ) VALUES (
      p_reservation_id, v_res.alumno_id, p_amount, v_currency,
      COALESCE(p_payment_date, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
      'mercadopago', p_mp_payment_id, p_mp_payment_id,
      'Pago Mercado Pago (' || p_mp_status || ')', v_status,
      v_inst_id, CASE WHEN v_inst_id IS NOT NULL THEN p_installment_number END
    ) RETURNING id INTO v_payment_id;
    v_action := 'inserted';
    v_became_validated := v_status = 'validado';
  END IF;

  IF v_action IN ('inserted', 'transitioned') THEN
    UPDATE public.mp_account_movements
       SET reservation_payment_id = v_payment_id
     WHERE mp_payment_id = p_mp_payment_id
       AND reservation_payment_id IS NULL
       AND suscripcion_id IS NULL;
  END IF;

  -- Saldos y cuotas siempre desde la fuente canónica (sin sumas incrementales).
  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);
  SELECT * INTO v_after FROM public.event_reservations WHERE id = p_reservation_id;

  IF v_became_validated THEN
    UPDATE public.event_reservations SET metodo_pago = 'mercadopago' WHERE id = p_reservation_id;
    IF COALESCE(v_after.amount_total, 0) > 0 AND COALESCE(v_after.balance_due, 0) <= 0
       AND v_res.reservation_status NOT IN ('reserva_confirmada', 'cancelada', 'rechazada')
       AND v_res.cancelled_at IS NULL THEN
      UPDATE public.event_reservations
         SET reservation_status = 'reserva_confirmada', estado = 'confirmada', confirmed_at = now()
       WHERE id = p_reservation_id;
    ELSIF COALESCE(v_after.balance_due, 0) > 0 AND v_res.reservation_status = 'solicitud_enviada' THEN
      UPDATE public.event_reservations SET estado = 'pendiente_verificacion' WHERE id = p_reservation_id;
    END IF;
  ELSIF v_action IN ('inserted', 'transitioned') AND v_status = 'rechazado'
        AND COALESCE(v_after.amount_paid, 0) <= 0 THEN
    UPDATE public.event_reservations SET payment_status = 'pago_rechazado' WHERE id = p_reservation_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'action', v_action, 'payment_id', v_payment_id, 'status', v_status,
    'became_validated', v_became_validated,
    'installment_id', v_inst_id,
    'was_confirmed', v_res.reservation_status = 'reserva_confirmada',
    'amount_paid', v_after.amount_paid, 'balance_due', v_after.balance_due,
    'fully_paid_now', COALESCE(v_after.amount_total, 0) > 0 AND COALESCE(v_after.balance_due, 0) <= 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_event_mp_payment(uuid, text, text, numeric, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_event_mp_payment(uuid, text, text, numeric, integer, date) TO service_role;
