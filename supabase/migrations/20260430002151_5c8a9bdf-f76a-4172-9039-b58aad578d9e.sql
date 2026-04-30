
-- QA Caso D: Rechazo EUR 100 sobre reserva 9b177ac7-33a2-4f60-a1af-768f440c97ed

-- 1) Paso alumno: informar pago EUR 100
INSERT INTO public.reservation_payments (
  id,
  reservation_id,
  original_amount,
  original_currency,
  amount,
  currency,
  event_currency,
  payment_method,
  payment_date,
  notes,
  proof_url,
  status
) VALUES (
  '11111111-dddd-4000-8000-000000000d01',
  '9b177ac7-33a2-4f60-a1af-768f440c97ed',
  100,
  'EUR',
  100,
  'EUR',
  'EUR',
  'transferencia',
  CURRENT_DATE,
  'QA Caso D - Rechazo EUR 100',
  'qa/9b177ac7-33a2-4f60-a1af-768f440c97ed/caso-d-eur-100.txt',
  'informado'
);

-- 2) Paso admin: rechazar
UPDATE public.reservation_payments
SET
  status = 'rechazado',
  review_action = 'rechazado',
  review_notes = 'comprobante ilegible',
  reviewed_at = now(),
  reviewed_by = (SELECT user_id FROM public.admin_profiles WHERE role = 'super_admin'::admin_role LIMIT 1),
  equivalent_amount_event_currency = NULL,
  exchange_rate_to_event_currency = NULL,
  manual_override = false
WHERE id = '11111111-dddd-4000-8000-000000000d01';

-- 3) Recalcular totales
SELECT public.recalculate_reservation_payment_totals('9b177ac7-33a2-4f60-a1af-768f440c97ed'::uuid);
