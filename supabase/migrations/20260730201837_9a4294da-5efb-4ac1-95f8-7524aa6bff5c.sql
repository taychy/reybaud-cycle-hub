
-- 1. Trigger: completar equivalente cuando la moneda coincide con la del evento
CREATE OR REPLACE FUNCTION public.fill_payment_equivalent_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_currency text;
BEGIN
  IF NEW.equivalent_amount_event_currency IS NULL THEN
    SELECT COALESCE(r.currency_snapshot, e.currency, 'ARS')
      INTO v_event_currency
    FROM public.event_reservations r
    LEFT JOIN public.events e ON e.id = r.event_id
    WHERE r.id = NEW.reservation_id;

    IF COALESCE(NEW.currency, v_event_currency) = v_event_currency THEN
      NEW.equivalent_amount_event_currency := NEW.amount;
      NEW.exchange_rate_to_event_currency := COALESCE(NEW.exchange_rate_to_event_currency, 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_payment_equivalent_amount ON public.reservation_payments;
CREATE TRIGGER trg_fill_payment_equivalent_amount
BEFORE INSERT OR UPDATE ON public.reservation_payments
FOR EACH ROW EXECUTE FUNCTION public.fill_payment_equivalent_amount();

-- 2. Recalculo: fallback al monto cuando la moneda coincide
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
  v_status         text;
BEGIN
  SELECT COALESCE(r.currency_snapshot, e.currency, 'ARS')
    INTO v_event_currency
  FROM public.event_reservations r
  LEFT JOIN public.events e ON e.id = r.event_id
  WHERE r.id = p_reservation_id;

  SELECT COALESCE(SUM(
           COALESCE(
             p.equivalent_amount_event_currency,
             CASE WHEN COALESCE(p.currency, v_event_currency) = v_event_currency THEN p.amount END,
             0
           )
         ), 0)
    INTO v_amount_paid
  FROM public.reservation_payments p
  WHERE p.reservation_id = p_reservation_id
    AND p.status = 'validado';

  SELECT COALESCE(SUM(condoned_amount), 0)
    INTO v_condoned_total
  FROM public.reservation_installments
  WHERE reservation_id = p_reservation_id;

  SELECT amount_total, payment_status
    INTO v_amount_total, v_old_status
  FROM public.event_reservations
  WHERE id = p_reservation_id;

  IF v_amount_total IS NULL THEN
    v_amount_total := 0;
  END IF;

  v_balance := GREATEST(v_amount_total - v_amount_paid - v_condoned_total, 0);

  IF v_amount_total <= 0 THEN
    v_new_status := COALESCE(v_old_status, 'no_aplica');
  ELSIF (v_amount_paid + v_condoned_total) <= 0 THEN
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

  v_pool := v_amount_paid;

  FOR v_inst IN
    SELECT id, amount, COALESCE(condoned_amount, 0) AS condoned_amount,
           installment_number, status
    FROM public.reservation_installments
    WHERE reservation_id = p_reservation_id
    ORDER BY installment_number ASC, due_date ASC NULLS LAST, id ASC
  LOOP
    IF v_inst.status = 'reprogramada' THEN
      UPDATE public.reservation_installments
      SET paid_amount = 0,
          balance_due = GREATEST(v_inst.amount - v_inst.condoned_amount, 0),
          updated_at = now()
      WHERE id = v_inst.id;
      CONTINUE;
    END IF;

    IF v_inst.condoned_amount >= v_inst.amount THEN
      UPDATE public.reservation_installments
      SET paid_amount = 0,
          balance_due = 0,
          status = 'condonada',
          updated_at = now()
      WHERE id = v_inst.id;
      CONTINUE;
    END IF;

    v_owe := GREATEST(v_inst.amount - v_inst.condoned_amount, 0);
    v_apply := LEAST(v_pool, v_owe);
    v_pool := v_pool - v_apply;

    IF (v_apply + v_inst.condoned_amount) <= 0 THEN
      v_status := 'pendiente';
    ELSIF v_apply >= v_owe THEN
      v_status := 'pagada';
    ELSE
      v_status := 'parcial';
    END IF;

    UPDATE public.reservation_installments
    SET paid_amount = v_apply,
        balance_due = GREATEST(v_owe - v_apply, 0),
        status = v_status,
        updated_at = now()
    WHERE id = v_inst.id;
  END LOOP;
END;
$function$;

-- 3. Backfill de equivalentes faltantes (misma moneda)
UPDATE public.reservation_payments p
SET equivalent_amount_event_currency = p.amount,
    exchange_rate_to_event_currency = COALESCE(p.exchange_rate_to_event_currency, 1)
FROM public.event_reservations r
LEFT JOIN public.events e ON e.id = r.event_id
WHERE r.id = p.reservation_id
  AND p.equivalent_amount_event_currency IS NULL
  AND COALESCE(p.currency, COALESCE(r.currency_snapshot, e.currency, 'ARS')) = COALESCE(r.currency_snapshot, e.currency, 'ARS');

-- 4. Vincular reserva externa de Rodrigo Caballeiro con su ficha de alumno
UPDATE public.event_reservations
SET alumno_id = '2e2f99cd-7e9f-455f-ad7b-e743b614ba00'
WHERE id = '81ca793d-e676-439f-953e-76c9896e3212'
  AND alumno_id IS NULL;

-- 5. Recalcular todas las reservas con pagos
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT reservation_id FROM public.reservation_payments LOOP
    PERFORM public.recalculate_reservation_payment_totals(r.reservation_id);
  END LOOP;
END $$;
