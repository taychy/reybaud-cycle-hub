
ALTER TABLE public.reservation_installment_history
  ADD COLUMN IF NOT EXISTS payment_id uuid,
  ADD COLUMN IF NOT EXISTS previous_installment_id uuid,
  ADD COLUMN IF NOT EXISTS new_installment_id uuid;

ALTER TABLE public.reservation_installment_history
  ALTER COLUMN reason SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rih_payment ON public.reservation_installment_history (payment_id);
