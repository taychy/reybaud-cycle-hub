-- =========================================================================
-- ETAPA 1: Plan de cuotas configurable por viaje/camp
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) event_installments — plantilla de cuotas por evento
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  label text NOT NULL,
  description text,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL,
  due_date date,
  external_payment_url_template text,
  payment_method_hint text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_event_installments_event
  ON public.event_installments (event_id, active, sort_order);

-- Unique parcial: un solo número activo por evento
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_installments_active_number
  ON public.event_installments (event_id, number)
  WHERE active = true;

-- Trigger updated_at
CREATE TRIGGER trg_event_installments_updated_at
  BEFORE UPDATE ON public.event_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.event_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage event_installments"
  ON public.event_installments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active event_installments"
  ON public.event_installments
  FOR SELECT TO public
  USING (active = true);


-- -------------------------------------------------------------------------
-- 2) reservation_installments — cuotas materializadas por reserva
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  event_installment_id uuid REFERENCES public.event_installments(id) ON DELETE SET NULL,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  label text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL,
  due_date date,
  external_payment_url text,
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente','parcial','pagada','condonada','reprogramada')),
  paid_amount numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_due numeric NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  condoned_at timestamptz,
  rescheduled_from_due_date date,
  notas text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reservation_installments_reservation
  ON public.reservation_installments (reservation_id, status);

CREATE INDEX IF NOT EXISTS idx_reservation_installments_due_date
  ON public.reservation_installments (due_date)
  WHERE status IN ('pendiente','parcial');

-- Unique: una sola cuota con ese número por reserva
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reservation_installments_number
  ON public.reservation_installments (reservation_id, installment_number);

-- Trigger updated_at
CREATE TRIGGER trg_reservation_installments_updated_at
  BEFORE UPDATE ON public.reservation_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.reservation_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reservation_installments"
  ON public.reservation_installments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view own reservation_installments"
  ON public.reservation_installments
  FOR SELECT TO authenticated
  USING (
    reservation_id IN (
      SELECT er.id
      FROM public.event_reservations er
      JOIN public.alumnos a ON a.id = er.alumno_id
      WHERE a.user_id = auth.uid()
    )
  );


-- -------------------------------------------------------------------------
-- 3) reservation_payments — vincular pago a cuota específica
-- -------------------------------------------------------------------------
ALTER TABLE public.reservation_payments
  ADD COLUMN IF NOT EXISTS installment_id uuid
    REFERENCES public.reservation_installments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_number integer;

CREATE INDEX IF NOT EXISTS idx_reservation_payments_installment
  ON public.reservation_payments (installment_id)
  WHERE installment_id IS NOT NULL;


-- -------------------------------------------------------------------------
-- 4) RPC: materialize_reservation_installments (idempotente)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_reservation_installments(p_reservation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_event_currency text;
  v_inserted integer := 0;
BEGIN
  SELECT er.event_id, COALESCE(er.currency_snapshot, e.currency)
    INTO v_event_id, v_event_currency
  FROM public.event_reservations er
  JOIN public.events e ON e.id = er.event_id
  WHERE er.id = p_reservation_id;

  IF v_event_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Insertar las cuotas activas del evento que aún no estén materializadas
  -- (idempotente: ON CONFLICT por (reservation_id, installment_number) no hace nada)
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

  -- Recalcular para reflejar pagos pre-existentes que ya tuvieran installment_id
  PERFORM public.recalculate_reservation_payment_totals(p_reservation_id);

  RETURN v_inserted;
END;
$$;


-- -------------------------------------------------------------------------
-- 5) RPC: recalculate_reservation_payment_totals — extender sin cambiar firma
-- -------------------------------------------------------------------------
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
  -- Suma SOLO pagos validados, en moneda del evento (total general)
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

  -- Estado canónico de la reserva
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

  -- ---------------------------------------------------------------------
  -- Recalcular cuotas (si la reserva tiene cuotas materializadas)
  -- - Sólo pagos validados con installment_id imputan a la cuota
  -- - paid_amount usa equivalent_amount_event_currency
  -- - status: pagada / parcial / pendiente
  -- - condonada y reprogramada NO se tocan automáticamente
  -- ---------------------------------------------------------------------
  WITH paid_per_installment AS (
    SELECT rp.installment_id,
           COALESCE(SUM(rp.equivalent_amount_event_currency), 0) AS paid
    FROM public.reservation_payments rp
    WHERE rp.reservation_id = p_reservation_id
      AND rp.status = 'validado'
      AND rp.installment_id IS NOT NULL
    GROUP BY rp.installment_id
  )
  UPDATE public.reservation_installments ri
  SET paid_amount = COALESCE(ppi.paid, 0),
      balance_due = GREATEST(ri.amount - COALESCE(ppi.paid, 0), 0),
      status = CASE
        WHEN ri.status IN ('condonada','reprogramada') THEN ri.status
        WHEN COALESCE(ppi.paid, 0) <= 0 THEN 'pendiente'
        WHEN COALESCE(ppi.paid, 0) >= ri.amount THEN 'pagada'
        ELSE 'parcial'
      END,
      updated_at = now()
  FROM (
    SELECT id FROM public.reservation_installments WHERE reservation_id = p_reservation_id
  ) target
  LEFT JOIN paid_per_installment ppi ON ppi.installment_id = target.id
  WHERE ri.id = target.id;
END;
$$;


-- -------------------------------------------------------------------------
-- 6) Migración de datos: metadata.installments → event_installments
-- -------------------------------------------------------------------------
INSERT INTO public.event_installments (
  event_id, number, label, amount, currency, due_date, sort_order, active
)
SELECT
  e.id AS event_id,
  COALESCE((inst->>'number')::int, ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY ord)::int) AS number,
  COALESCE(NULLIF(inst->>'label', ''), 'Cuota ' || COALESCE(inst->>'number', ord::text)) AS label,
  COALESCE(NULLIF(inst->>'amount', '')::numeric, 0) AS amount,
  COALESCE(NULLIF(inst->>'currency', ''), e.currency, 'ARS') AS currency,
  CASE
    WHEN inst->>'due_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (inst->>'due_date')::date
    ELSE NULL
  END AS due_date,
  ord::int AS sort_order,
  true AS active
FROM public.events e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.metadata->'installments', '[]'::jsonb))
  WITH ORDINALITY AS t(inst, ord)
WHERE COALESCE((e.metadata->>'installments_enabled')::boolean, false) = true
  AND jsonb_typeof(e.metadata->'installments') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_installments ei WHERE ei.event_id = e.id
  );
