ALTER TABLE public.delivery_list_payments
  ADD COLUMN IF NOT EXISTS rechazado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rechazado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rechazado_por UUID,
  ADD COLUMN IF NOT EXISTS rechazado_motivo TEXT;