-- Add annulation fields to reservation_payments
ALTER TABLE public.reservation_payments
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS anulado_motivo text;

-- Create audit table for payment changes
CREATE TABLE public.reservation_payment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  action text NOT NULL, -- 'edicion' | 'anulacion'
  field_changed text, -- e.g. 'amount', 'payment_method', null for anulacion
  old_value text,
  new_value text,
  reason text,
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reservation_payment_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reservation_payment_changes"
  ON public.reservation_payment_changes
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_rpc_payment_id ON public.reservation_payment_changes(payment_id);
CREATE INDEX idx_rpc_reservation_id ON public.reservation_payment_changes(reservation_id);