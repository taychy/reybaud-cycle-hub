CREATE TABLE public.reservation_transfer_direct_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.reservation_transfers(id) ON DELETE RESTRICT,
  replacement_reservation_id uuid NOT NULL,
  original_reservation_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text,
  paid_at date NOT NULL,
  proof_path text,
  notes text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','voided')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
COMMENT ON TABLE public.reservation_transfer_direct_payments IS 'Pagos directos reemplazante -> titular original (cuenta personal). Caja Reybaud $0: nunca generan reservation_payments, gastos, devoluciones ni conciliacion MP/banco.';
CREATE INDEX ON public.reservation_transfer_direct_payments (transfer_id);
CREATE INDEX ON public.reservation_transfer_direct_payments (replacement_reservation_id);
GRANT SELECT ON public.reservation_transfer_direct_payments TO authenticated;
GRANT ALL ON public.reservation_transfer_direct_payments TO service_role;
ALTER TABLE public.reservation_transfer_direct_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen pagos directos de transferencias" ON public.reservation_transfer_direct_payments
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

-- Resumen efectivo: acuerdo = referencia; solo pagos reales a Reybaud + directos confirmados reducen obligación.
CREATE OR REPLACE FUNCTION public.reservation_effective_payment_summary(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; t record; v_real numeric; v_direct numeric; v_total numeric; v_direct_received numeric;
BEGIN
  SELECT * INTO r FROM event_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())
     OR EXISTS (SELECT 1 FROM alumnos a WHERE a.id = r.alumno_id AND (a.user_id = auth.uid() OR lower(a.email) = lower(auth.email())))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT COALESCE(sum(COALESCE(p.obligation_amount_contract, p.equivalent_amount_event_currency, p.amount)),0) INTO v_real
    FROM reservation_payments p WHERE p.reservation_id = p_reservation_id AND p.status = 'validado' AND p.anulado_at IS NULL;
  SELECT COALESCE(sum(amount),0) INTO v_direct FROM reservation_transfer_direct_payments
   WHERE replacement_reservation_id = p_reservation_id AND status = 'confirmed';
  SELECT COALESCE(sum(amount),0) INTO v_direct_received FROM reservation_transfer_direct_payments
   WHERE original_reservation_id = p_reservation_id AND status = 'confirmed';
  SELECT * INTO t FROM reservation_transfers WHERE replacement_reservation_id = p_reservation_id AND status <> 'cancelled'
   ORDER BY created_at DESC LIMIT 1;
  v_total := COALESCE(r.amount_total, 0);
  RETURN jsonb_build_object(
    'contractual_total', v_total,
    'paid_to_reybaud_real', v_real,
    'direct_external_confirmed', v_direct,
    'total_applied', v_real + v_direct,
    'effective_balance', GREATEST(v_total - v_real - v_direct, 0),
    'direct_agreed_reference', COALESCE(t.direct_payment_amount, 0),
    'reybaud_agreed_reference', COALESCE(t.amount_to_reybaud, 0),
    'direct_received_as_original', v_direct_received,
    'transfer_id', t.id);
END $$;
REVOKE ALL ON FUNCTION public.reservation_effective_payment_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservation_effective_payment_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_reservation_transfer_direct_payment(
  p_transfer_id uuid, p_amount numeric, p_paid_at date, p_proof_path text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v_sum numeric; v_id uuid; v_cur text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO t FROM reservation_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia no encontrada'; END IF;
  IF t.replacement_reservation_id IS NULL THEN RAISE EXCEPTION 'La transferencia no tiene reemplazante'; END IF;
  IF t.agreement_defined_at IS NULL THEN RAISE EXCEPTION 'Primero definí el acuerdo de pago'; END IF;
  IF t.status = 'cancelled' THEN RAISE EXCEPTION 'Transferencia cancelada'; END IF;
  IF t.payment_mode NOT IN ('direct_to_original','mixed') THEN RAISE EXCEPTION 'El acuerdo no contempla pago directo'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El importe debe ser mayor a 0'; END IF;
  IF p_paid_at IS NULL THEN RAISE EXCEPTION 'Indicá la fecha del pago'; END IF;
  SELECT COALESCE(sum(amount),0) INTO v_sum FROM reservation_transfer_direct_payments WHERE transfer_id = t.id AND status = 'confirmed';
  IF v_sum + p_amount > COALESCE(t.direct_payment_amount,0) THEN
    RAISE EXCEPTION 'Supera el monto directo acordado (acordado %, ya confirmado %)', t.direct_payment_amount, v_sum; END IF;
  SELECT currency_snapshot INTO v_cur FROM event_reservations WHERE id = t.replacement_reservation_id;
  INSERT INTO reservation_transfer_direct_payments (transfer_id, replacement_reservation_id, original_reservation_id, amount, currency, paid_at, proof_path, notes, created_by)
  VALUES (t.id, t.replacement_reservation_id, t.original_reservation_id, p_amount, v_cur, p_paid_at, NULLIF(p_proof_path,''), NULLIF(p_notes,''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'reserva.transferencia.pago_directo_registrado', 'reservation_transfer', t.id::text,
    jsonb_build_object('direct_payment_id', v_id, 'amount', p_amount, 'paid_at', p_paid_at, 'caja_reybaud', 0, 'proof_path', p_proof_path));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.register_reservation_transfer_direct_payment(uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_reservation_transfer_direct_payment(uuid, numeric, date, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.void_reservation_transfer_direct_payment(p_direct_payment_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Indicá el motivo de anulación'; END IF;
  SELECT * INTO d FROM reservation_transfer_direct_payments WHERE id = p_direct_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago directo no encontrado'; END IF;
  IF d.status = 'voided' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF EXISTS (SELECT 1 FROM reservation_transfers WHERE id = d.transfer_id AND status = 'completed') THEN
    RAISE EXCEPTION 'La transferencia ya está completada; no se puede anular'; END IF;
  UPDATE reservation_transfer_direct_payments SET status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason, updated_at = now()
   WHERE id = d.id;
  INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'reserva.transferencia.pago_directo_anulado', 'reservation_transfer', d.transfer_id::text,
    jsonb_build_object('direct_payment_id', d.id, 'amount', d.amount, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.void_reservation_transfer_direct_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_reservation_transfer_direct_payment(uuid, text) TO authenticated, service_role;

-- Cierre solo con cumplimiento real.
CREATE OR REPLACE FUNCTION public.complete_reservation_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v_ob text; s jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO t FROM reservation_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia no encontrada'; END IF;
  IF t.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF t.replacement_reservation_id IS NULL OR t.agreement_defined_at IS NULL THEN RAISE EXCEPTION 'Falta reemplazante o acuerdo de pago'; END IF;
  IF EXISTS (SELECT 1 FROM event_reservations WHERE id = t.replacement_reservation_id AND reservation_status IN ('cancelada','rechazada','expirada')) THEN
    RAISE EXCEPTION 'La reserva reemplazante no está activa'; END IF;
  s := reservation_effective_payment_summary(t.replacement_reservation_id);
  IF t.payment_mode IN ('direct_to_original','mixed') AND (s->>'direct_external_confirmed')::numeric < COALESCE(t.direct_payment_amount,0) THEN
    RAISE EXCEPTION 'Falta registrar pago directo al titular anterior (confirmado %, acordado %)', s->>'direct_external_confirmed', t.direct_payment_amount; END IF;
  IF (s->>'effective_balance')::numeric > 0 THEN
    RAISE EXCEPTION 'El reemplazante aún tiene saldo efectivo pendiente: %', s->>'effective_balance'; END IF;
  IF t.reybaud_refund_amount > 0 THEN
    SELECT estado INTO v_ob FROM reservation_refund_obligations WHERE reservation_id = t.original_reservation_id;
    IF COALESCE(v_ob,'') <> 'completada' THEN
      RAISE EXCEPTION 'Falta registrar la devolución real de Reybaud al titular anterior (estado: %)', COALESCE(v_ob,'sin obligación'); END IF;
  END IF;
  UPDATE reservation_transfers SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = t.id;
  INSERT INTO reservation_status_history (reservation_id, changed_by, changed_by_role, note)
  VALUES (t.original_reservation_id, auth.uid(), 'admin', 'Cancelada — reemplazada (transferencia completada)');
  INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'reserva.transferencia.completada', 'reservation_transfer', t.id::text,
    jsonb_build_object('original', t.original_reservation_id, 'replacement', t.replacement_reservation_id, 'summary', s));
  RETURN jsonb_build_object('ok', true, 'summary', s);
END $$;