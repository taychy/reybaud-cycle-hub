-- 1. Columnas extras en reservation_installments para condonación / reprogramación
ALTER TABLE public.reservation_installments
  ADD COLUMN IF NOT EXISTS original_due_date date,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS condoned_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS condoned_by uuid,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_by uuid;

-- 2. Tabla de auditoría
CREATE TABLE IF NOT EXISTS public.reservation_installment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_installment_id uuid,
  reservation_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN (
    'created','updated','condoned','rescheduled','reactivated',
    'payment_applied','payment_removed','reassigned','deactivated'
  )),
  before jsonb,
  after jsonb,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ri_history_installment ON public.reservation_installment_history(reservation_installment_id);
CREATE INDEX IF NOT EXISTS idx_ri_history_reservation ON public.reservation_installment_history(reservation_id);

ALTER TABLE public.reservation_installment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage installment history"
  ON public.reservation_installment_history
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students view own installment history"
  ON public.reservation_installment_history
  FOR SELECT
  TO authenticated
  USING (
    reservation_id IN (
      SELECT er.id FROM public.event_reservations er
      JOIN public.alumnos a ON a.id = er.alumno_id
      WHERE a.user_id = auth.uid()
    )
  );

-- 3. Recalculate ajustado: descuenta condonaciones del balance de la reserva
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

  -- Balance = total - pagado - condonado (amount_total se mantiene intacto)
  v_balance := GREATEST(v_amount_total - v_amount_paid - v_condoned_total, 0);

  -- Estado canónico de la reserva
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

  -- Recalcular cuotas (sólo pagos validados imputados a cuota)
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
      balance_due = GREATEST(ri.amount - COALESCE(ppi.paid, 0) - COALESCE(ri.condoned_amount, 0), 0),
      status = CASE
        WHEN ri.status IN ('reprogramada') THEN ri.status
        WHEN COALESCE(ri.condoned_amount, 0) >= ri.amount THEN 'condonada'
        WHEN (COALESCE(ppi.paid, 0) + COALESCE(ri.condoned_amount, 0)) <= 0 THEN 'pendiente'
        WHEN (COALESCE(ppi.paid, 0) + COALESCE(ri.condoned_amount, 0)) >= ri.amount THEN 'pagada'
        ELSE 'parcial'
      END,
      updated_at = now()
  FROM (
    SELECT id FROM public.reservation_installments WHERE reservation_id = p_reservation_id
  ) target
  LEFT JOIN paid_per_installment ppi ON ppi.installment_id = target.id
  WHERE ri.id = target.id;
END;
$function$;

-- 4. RPC condone_installment con motivo obligatorio + auditoría
CREATE OR REPLACE FUNCTION public.condone_installment(
  p_installment_id uuid,
  p_amount numeric,
  p_reason text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst record;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo obligatorio para condonar una cuota';
  END IF;

  SELECT * INTO v_inst FROM public.reservation_installments WHERE id = p_installment_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Cuota no encontrada';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    p_amount := v_inst.amount - COALESCE(v_inst.paid_amount, 0) - COALESCE(v_inst.condoned_amount, 0);
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Monto a condonar inválido';
  END IF;

  v_before := to_jsonb(v_inst);

  UPDATE public.reservation_installments
  SET condoned_amount = COALESCE(condoned_amount, 0) + p_amount,
      condoned_at = now(),
      condoned_by = auth.uid(),
      status_reason = p_reason,
      updated_at = now()
  WHERE id = p_installment_id;

  PERFORM public.recalculate_reservation_payment_totals(v_inst.reservation_id);

  SELECT to_jsonb(ri.*) INTO v_after FROM public.reservation_installments ri WHERE ri.id = p_installment_id;

  INSERT INTO public.reservation_installment_history(
    reservation_installment_id, reservation_id, action, before, after, reason, changed_by
  ) VALUES (
    p_installment_id, v_inst.reservation_id, 'condoned', v_before, v_after, p_reason, auth.uid()
  );
END;
$function$;

-- 5. RPC reschedule_installment con motivo obligatorio + auditoría
CREATE OR REPLACE FUNCTION public.reschedule_installment(
  p_installment_id uuid,
  p_new_due_date date,
  p_reason text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst record;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo obligatorio para reprogramar una cuota';
  END IF;

  IF p_new_due_date IS NULL THEN
    RAISE EXCEPTION 'Nueva fecha obligatoria';
  END IF;

  SELECT * INTO v_inst FROM public.reservation_installments WHERE id = p_installment_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Cuota no encontrada';
  END IF;

  v_before := to_jsonb(v_inst);

  UPDATE public.reservation_installments
  SET original_due_date = COALESCE(original_due_date, due_date),
      due_date = p_new_due_date,
      status = 'reprogramada',
      status_reason = p_reason,
      rescheduled_at = now(),
      rescheduled_by = auth.uid(),
      updated_at = now()
  WHERE id = p_installment_id;

  SELECT to_jsonb(ri.*) INTO v_after FROM public.reservation_installments ri WHERE ri.id = p_installment_id;

  INSERT INTO public.reservation_installment_history(
    reservation_installment_id, reservation_id, action, before, after, reason, changed_by
  ) VALUES (
    p_installment_id, v_inst.reservation_id, 'rescheduled', v_before, v_after, p_reason, auth.uid()
  );
END;
$function$;
