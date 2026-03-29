
-- 1. Evolve event_reservations with new fields
ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS reservation_status text NOT NULL DEFAULT 'solicitud_enviada',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'no_informado',
  ADD COLUMN IF NOT EXISTS amount_total numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_snapshot numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS currency_snapshot text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_due_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'cliente',
  ADD COLUMN IF NOT EXISTS admin_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS participant_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accepted_terms boolean NOT NULL DEFAULT false;

-- Migrate existing data: map old estado to new fields
UPDATE public.event_reservations
SET reservation_status = CASE
      WHEN estado = 'pago_confirmado' THEN 'reserva_confirmada'
      WHEN estado = 'pendiente_verificacion' THEN 'reserva_pendiente'
      ELSE 'solicitud_enviada'
    END,
    payment_status = CASE
      WHEN estado = 'pago_confirmado' THEN 'pago_validado'
      WHEN estado = 'pendiente_verificacion' THEN 'pago_informado'
      ELSE 'no_informado'
    END,
    amount_total = monto,
    price_snapshot = monto,
    currency_snapshot = moneda,
    amount_paid = CASE WHEN estado = 'pago_confirmado' THEN COALESCE(monto, 0) ELSE 0 END,
    balance_due = CASE WHEN estado = 'pago_confirmado' THEN 0 ELSE monto END,
    confirmed_at = CASE WHEN estado = 'pago_confirmado' THEN updated_at ELSE NULL END;

-- Add unique constraint to prevent duplicate active reservations
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_reservations_unique_active
ON public.event_reservations (event_id, alumno_id)
WHERE reservation_status NOT IN ('cancelada', 'rechazada');

-- 2. Create reservation_payments table
CREATE TABLE public.reservation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'efectivo',
  payment_reference text DEFAULT NULL,
  proof_url text DEFAULT NULL,
  notes text DEFAULT NULL,
  status text NOT NULL DEFAULT 'informado',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz DEFAULT NULL,
  reviewed_by uuid DEFAULT NULL
);

ALTER TABLE public.reservation_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reservation_payments" ON public.reservation_payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can insert own reservation_payments" ON public.reservation_payments
  FOR INSERT TO authenticated
  WITH CHECK (alumno_id IN (SELECT id FROM alumnos WHERE user_id = auth.uid()));

CREATE POLICY "Students can view own reservation_payments" ON public.reservation_payments
  FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM alumnos WHERE user_id = auth.uid()));

-- 3. Create reservation_status_history table
CREATE TABLE public.reservation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  old_reservation_status text DEFAULT NULL,
  new_reservation_status text DEFAULT NULL,
  old_payment_status text DEFAULT NULL,
  new_payment_status text DEFAULT NULL,
  changed_by uuid DEFAULT NULL,
  changed_by_role text DEFAULT NULL,
  note text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reservation_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reservation_status_history" ON public.reservation_status_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view own reservation_status_history" ON public.reservation_status_history
  FOR SELECT TO authenticated
  USING (reservation_id IN (
    SELECT id FROM event_reservations WHERE alumno_id IN (
      SELECT id FROM alumnos WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Students can insert reservation_status_history" ON public.reservation_status_history
  FOR INSERT TO authenticated
  WITH CHECK (reservation_id IN (
    SELECT id FROM event_reservations WHERE alumno_id IN (
      SELECT id FROM alumnos WHERE user_id = auth.uid()
    )
  ));
