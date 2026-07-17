-- Recalcula pagos con distribución FIFO por cuota:
-- cualquier excedente sobre una cuota pasa automáticamente a las siguientes
-- (por installment_number), en lugar de quedar "atrapado" en la cuota pagada.
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
  v_pool           numeric;
  v_inst           record;
  v_owe            numeric;
  v_apply          numeric;
  v_status         text;
BEGIN
  -- Suma SOLO pagos validados, en moneda del evento
  SELECT COALESCE(SUM(equivalent_amount_event_currency), 0)
    INTO v_amount_paid
  FROM public.reservation_payments
  WHERE reservation_id = p_reservation_id
    AND status = 'validado';

  -- Suma condonaciones de cuotas de esta reserva
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

  -- Distribución FIFO del total pagado sobre las cuotas por orden.
  -- Cuotas 'reprogramada' o 'condonada' no reciben imputación FIFO.
  v_pool := v_amount_paid;

  FOR v_inst IN
    SELECT id, amount, COALESCE(condoned_amount, 0) AS condoned_amount,
           installment_number, status
    FROM public.reservation_installments
    WHERE reservation_id = p_reservation_id
    ORDER BY installment_number ASC, due_date ASC NULLS LAST, id ASC
  LOOP
    IF v_inst.status = 'reprogramada' THEN
      -- Mantener status pero recalcular balance según condonaciones
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