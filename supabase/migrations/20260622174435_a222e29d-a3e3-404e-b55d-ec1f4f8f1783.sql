ALTER TABLE public.reservation_installments
  DROP CONSTRAINT IF EXISTS reservation_installments_installment_number_check;

ALTER TABLE public.reservation_installments
  ADD CONSTRAINT reservation_installments_installment_number_check CHECK (installment_number >= 0);

CREATE OR REPLACE FUNCTION public.recalculate_reservation_payment_totals(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount_total numeric;
  v_amount_paid  numeric;
  v_balance      numeric;
  v_new_status   text;
  v_old_status   text;
  v_remaining_general numeric := 0;
  v_specific_paid numeric := 0;
  v_apply_general numeric := 0;
  v_installment_paid numeric := 0;
  v_installment_balance numeric := 0;
  rec record;
BEGIN
  SELECT COALESCE(SUM(COALESCE(equivalent_amount_event_currency, amount)), 0)
    INTO v_amount_paid
  FROM public.reservation_payments
  WHERE reservation_id = p_reservation_id
    AND status = 'validado';

  SELECT amount_total, payment_status
    INTO v_amount_total, v_old_status
  FROM public.event_reservations
  WHERE id = p_reservation_id;

  IF v_amount_total IS NULL THEN
    v_amount_total := 0;
  END IF;

  v_balance := GREATEST(v_amount_total - v_amount_paid, 0);

  IF v_amount_total <= 0 THEN
    v_new_status := COALESCE(v_old_status, 'no_aplica');
  ELSIF v_amount_paid <= 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.reservation_payments
      WHERE reservation_id = p_reservation_id AND status = 'informado'
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

  SELECT COALESCE(SUM(COALESCE(equivalent_amount_event_currency, amount)), 0)
    INTO v_remaining_general
  FROM public.reservation_payments
  WHERE reservation_id = p_reservation_id
    AND status = 'validado'
    AND installment_id IS NULL;

  FOR rec IN
    SELECT ri.id, ri.amount, ri.status, ri.condoned_amount,
           COALESCE(SUM(COALESCE(rp.equivalent_amount_event_currency, rp.amount)), 0) AS specific_paid
    FROM public.reservation_installments ri
    LEFT JOIN public.reservation_payments rp
      ON rp.installment_id = ri.id
     AND rp.reservation_id = p_reservation_id
     AND rp.status = 'validado'
    WHERE ri.reservation_id = p_reservation_id
    GROUP BY ri.id, ri.amount, ri.status, ri.condoned_amount, ri.sort_order, ri.installment_number
    ORDER BY ri.sort_order ASC NULLS LAST, ri.installment_number ASC
  LOOP
    v_specific_paid := COALESCE(rec.specific_paid, 0);
    v_apply_general := LEAST(GREATEST(COALESCE(rec.amount, 0) - v_specific_paid - COALESCE(rec.condoned_amount, 0), 0), v_remaining_general);
    v_remaining_general := GREATEST(v_remaining_general - v_apply_general, 0);
    v_installment_paid := v_specific_paid + v_apply_general;
    v_installment_balance := GREATEST(COALESCE(rec.amount, 0) - v_installment_paid - COALESCE(rec.condoned_amount, 0), 0);

    UPDATE public.reservation_installments ri
    SET paid_amount = v_installment_paid,
        monto_pagado = v_installment_paid,
        balance_due = v_installment_balance,
        saldo_pendiente = v_installment_balance,
        status = CASE
          WHEN rec.status = 'condonada' THEN rec.status
          WHEN v_installment_balance <= 0 THEN 'pagada'
          WHEN v_installment_paid > 0 THEN 'parcial'
          ELSE 'pendiente'
        END,
        updated_at = now()
    WHERE ri.id = rec.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.materialize_reservation_installments(p_reservation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_reservation_payment_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_reservation_payment_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_reservation_installments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_reservation_installments(uuid) TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT er.id
    FROM public.event_reservations er
    WHERE jsonb_typeof(er.payment_plan_snapshot->'calculated'->'installments') = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM public.reservation_installments ri WHERE ri.reservation_id = er.id
      )
  LOOP
    PERFORM public.materialize_reservation_installments(r.id);
  END LOOP;
END $$;