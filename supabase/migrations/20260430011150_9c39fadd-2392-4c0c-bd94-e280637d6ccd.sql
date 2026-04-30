-- Materializar cuotas en la reserva QA preservada
SELECT public.materialize_reservation_installments('9b177ac7-33a2-4f60-a1af-768f440c97ed');

-- Imputar un pago validado existente a la cuota 1 (Seña) para activar el bloqueo
UPDATE public.reservation_payments
SET installment_id = (
  SELECT id FROM public.reservation_installments
  WHERE reservation_id = '9b177ac7-33a2-4f60-a1af-768f440c97ed' AND installment_number = 1
),
installment_number = 1
WHERE id = '11111111-aaaa-4000-8000-000000000a01';

-- Recalcular para reflejar el pago en la cuota
SELECT public.recalculate_reservation_payment_totals('9b177ac7-33a2-4f60-a1af-768f440c97ed');