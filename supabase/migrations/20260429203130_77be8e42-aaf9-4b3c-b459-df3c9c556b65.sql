-- ============================================================
-- ETAPA 1: Multi-moneda en reservation_payments
-- ============================================================

-- 1. Columnas nuevas (las existentes proof_url, reviewed_at, reviewed_by se reutilizan)
ALTER TABLE public.reservation_payments
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_event_currency numeric,
  ADD COLUMN IF NOT EXISTS equivalent_amount_event_currency numeric,
  ADD COLUMN IF NOT EXISTS event_currency text,
  ADD COLUMN IF NOT EXISTS review_action text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;

-- Índice para acelerar el recálculo
CREATE INDEX IF NOT EXISTS idx_reservation_payments_reservation_status
  ON public.reservation_payments(reservation_id, status);

-- 2. Backfill: pagos viejos heredan original_* desde amount/currency
UPDATE public.reservation_payments
SET original_amount = amount,
    original_currency = currency,
    event_currency = COALESCE(event_currency, currency),
    equivalent_amount_event_currency = COALESCE(equivalent_amount_event_currency, amount),
    exchange_rate_to_event_currency = COALESCE(exchange_rate_to_event_currency, 1)
WHERE original_amount IS NULL;

-- 3. Función de recálculo idempotente (SECURITY DEFINER para bypass RLS controlado)
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
BEGIN
  -- Suma SOLO pagos validados, en moneda del evento
  SELECT COALESCE(SUM(equivalent_amount_event_currency), 0)
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

  -- Estado canónico
  IF v_amount_total <= 0 THEN
    v_new_status := COALESCE(v_old_status, 'no_aplica');
  ELSIF v_amount_paid <= 0 THEN
    -- Si hay pagos informados sin validar, dejar pago_informado; sino no_informado
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
END;
$$;

-- 4. Bucket privado para comprobantes
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 5. RLS del bucket: alumno sube/lee lo propio bajo {alumno_id}/..., admin todo
DROP POLICY IF EXISTS "Alumnos pueden subir comprobantes propios" ON storage.objects;
CREATE POLICY "Alumnos pueden subir comprobantes propios"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.alumnos WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Alumnos pueden leer comprobantes propios" ON storage.objects;
CREATE POLICY "Alumnos pueden leer comprobantes propios"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.alumnos WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins pueden gestionar comprobantes" ON storage.objects;
CREATE POLICY "Admins pueden gestionar comprobantes"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));