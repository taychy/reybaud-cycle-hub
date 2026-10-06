ALTER TABLE public.reservation_transfers ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
ALTER TABLE public.reservation_transfers ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0;

-- ¿La reserva tiene pagos adicionales bloqueados por transferencia sin acuerdo? (solo booleano, sin datos sensibles)
CREATE OR REPLACE FUNCTION public.reservation_transfer_payment_blocked(p_reservation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM reservation_transfers t
     WHERE t.replacement_reservation_id = p_reservation_id
       AND t.agreement_defined_at IS NULL
       AND t.status IN ('reserved','deposit_paid','payment_agreement_pending')
       AND EXISTS (SELECT 1 FROM reservation_payments p WHERE p.reservation_id = p_reservation_id AND p.status = 'validado' AND p.anulado_at IS NULL)
  );
$$;
REVOKE ALL ON FUNCTION public.reservation_transfer_payment_blocked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservation_transfer_payment_blocked(uuid) TO anon, authenticated, service_role;

-- Primera seña validada del reemplazante => pendiente de acuerdo + alerta urgente (deduplicada)
CREATE OR REPLACE FUNCTION public.trg_transfer_deposit_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; r record; v_name text; v_email text; v_tel text;
BEGIN
  IF NEW.status <> 'validado' OR NEW.anulado_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'validado' THEN RETURN NEW; END IF;
  SELECT * INTO t FROM reservation_transfers
   WHERE replacement_reservation_id = NEW.reservation_id AND status IN ('reserved','deposit_paid') AND agreement_defined_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO r FROM event_reservations WHERE id = NEW.reservation_id;
  SELECT COALESCE(trim(concat_ws(' ', a.nombre, a.apellido)), trim(concat_ws(' ', e.nombre, e.apellido))),
         COALESCE(a.email, e.email, r.external_email), COALESCE(a.telefono, e.telefono)
    INTO v_name, v_email, v_tel
    FROM (SELECT 1) x
    LEFT JOIN alumnos a ON a.id = r.alumno_id
    LEFT JOIN event_external_participants e ON e.id = r.external_participant_id;
  UPDATE reservation_transfers SET status = 'payment_agreement_pending', deposit_paid_at = now(),
         deposit_amount = COALESCE(NEW.equivalent_amount_event_currency, NEW.amount, 0), updated_at = now()
   WHERE id = t.id;
  INSERT INTO admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
  VALUES ('reservation_transfer_deposit_paid', 'alta', NEW.reservation_id,
    jsonb_build_object('titulo', 'URGENTE — Contactar comprador de cupo transferido',
      'transfer_id', t.id, 'event_id', t.event_id, 'package_id', t.package_id,
      'original_reservation_id', t.original_reservation_id, 'replacement_reservation_id', NEW.reservation_id,
      'importe_sena', COALESCE(NEW.equivalent_amount_event_currency, NEW.amount, 0), 'moneda', COALESCE(r.currency_snapshot, r.moneda),
      'comprador', v_name, 'email', v_email, 'telefono', v_tel),
    'reservation_transfer_deposit_paid:' || t.id::text)
  ON CONFLICT (deduplication_key) DO NOTHING;
  INSERT INTO audit_log (user_role, action, entity_type, entity_id, details)
  VALUES ('system', 'reserva.transferencia.sena_recibida', 'reservation_transfer', t.id::text,
    jsonb_build_object('payment_id', NEW.id, 'replacement_reservation_id', NEW.reservation_id, 'importe', COALESCE(NEW.equivalent_amount_event_currency, NEW.amount, 0)));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_transfer_deposit_paid() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_reservation_transfer_deposit_paid ON public.reservation_payments;
CREATE TRIGGER trg_reservation_transfer_deposit_paid AFTER INSERT OR UPDATE OF status ON public.reservation_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_transfer_deposit_paid();

CREATE OR REPLACE FUNCTION public.mark_reservation_transfer_contacted(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE reservation_transfers SET admin_contacted_at = COALESCE(admin_contacted_at, now()), updated_at = now() WHERE id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia no encontrada'; END IF;
  INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'reserva.transferencia.contactado', 'reservation_transfer', p_transfer_id::text, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.define_reservation_transfer_payment_agreement(
  p_transfer_id uuid, p_payment_mode text, p_direct_payment_amount numeric, p_amount_to_reybaud numeric,
  p_reybaud_refund_amount numeric, p_notes text DEFAULT NULL, p_admin_contacted boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v_direct numeric; v_rey numeric; v_ref numeric; v_ob jsonb := NULL;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO t FROM reservation_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia no encontrada'; END IF;
  IF t.replacement_reservation_id IS NULL THEN RAISE EXCEPTION 'La transferencia todavía no tiene reserva reemplazante'; END IF;
  IF t.agreement_defined_at IS NOT NULL OR t.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'El acuerdo ya fue definido; no se puede redefinir'; END IF;
  IF p_payment_mode NOT IN ('direct_to_original','reybaud','mixed') THEN RAISE EXCEPTION 'Modalidad inválida'; END IF;
  v_direct := COALESCE(p_direct_payment_amount,0); v_rey := COALESCE(p_amount_to_reybaud,0); v_ref := COALESCE(p_reybaud_refund_amount,0);
  IF v_direct < 0 OR v_rey < 0 OR v_ref < 0 THEN RAISE EXCEPTION 'Los importes no pueden ser negativos'; END IF;
  IF p_payment_mode = 'direct_to_original' AND (v_ref > 0 OR v_direct <= 0) THEN
    RAISE EXCEPTION 'Pago directo: indicá el monto directo y sin devolución de Reybaud'; END IF;
  IF p_payment_mode = 'reybaud' AND v_direct > 0 THEN RAISE EXCEPTION 'Pago a Reybaud: el monto directo debe ser 0'; END IF;
  IF p_payment_mode = 'mixed' AND (v_direct <= 0 OR (v_rey <= 0 AND v_ref <= 0)) THEN
    RAISE EXCEPTION 'Mixto: indicá parte directa y parte Reybaud'; END IF;
  IF v_ref > COALESCE(t.original_paid_amount,0) THEN RAISE EXCEPTION 'La devolución de Reybaud no puede superar lo pagado por el titular original'; END IF;
  IF v_direct + v_ref > COALESCE(t.original_paid_amount,0) THEN
    RAISE EXCEPTION 'Directo + devolución Reybaud superan lo pagado por el titular original (doble reintegro)'; END IF;

  UPDATE reservation_transfers SET payment_mode = p_payment_mode, direct_payment_amount = v_direct,
    amount_to_original = v_direct, amount_to_reybaud = v_rey, reybaud_refund_amount = v_ref,
    notes = COALESCE(p_notes, notes),
    admin_contacted_at = CASE WHEN p_admin_contacted THEN COALESCE(admin_contacted_at, now()) ELSE admin_contacted_at END,
    agreement_defined_at = now(), status = 'payment_agreement_defined', updated_at = now()
   WHERE id = t.id;

  -- Solo la parte que Reybaud devuelve genera obligación (sin egreso real hasta que se pague).
  IF v_ref > 0 THEN
    v_ob := registrar_obligacion_devolucion(t.original_reservation_id, 'pendiente', 0, v_ref,
      format('Transferencia de cupo (%s): Reybaud devuelve %s', p_payment_mode, v_ref), 'transferencia', NULL);
    IF v_ob->>'status' = 'ya_existia' THEN
      PERFORM ajustar_obligacion_devolucion(t.original_reservation_id, v_ref, 'Acuerdo de transferencia de cupo ' || t.id::text);
    END IF;
  END IF;

  INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'reserva.transferencia.acuerdo_definido', 'reservation_transfer', t.id::text,
    jsonb_build_object('payment_mode', p_payment_mode, 'direct_payment_amount', v_direct, 'amount_to_reybaud', v_rey,
      'reybaud_refund_amount', v_ref, 'caja_reybaud_directo', 0, 'obligacion', v_ob));
  RETURN jsonb_build_object('ok', true, 'obligacion', v_ob);
END $$;

CREATE OR REPLACE FUNCTION public.complete_reservation_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v_ob text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO t FROM reservation_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia no encontrada'; END IF;
  IF t.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF t.replacement_reservation_id IS NULL OR t.agreement_defined_at IS NULL THEN RAISE EXCEPTION 'Falta reemplazante o acuerdo de pago'; END IF;
  IF EXISTS (SELECT 1 FROM event_reservations WHERE id = t.replacement_reservation_id AND reservation_status IN ('cancelada','rechazada','expirada')) THEN
    RAISE EXCEPTION 'La reserva reemplazante no está activa'; END IF;
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
    jsonb_build_object('original', t.original_reservation_id, 'replacement', t.replacement_reservation_id));
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.mark_reservation_transfer_contacted(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.define_reservation_transfer_payment_agreement(uuid, text, numeric, numeric, numeric, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_reservation_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_reservation_transfer_contacted(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.define_reservation_transfer_payment_agreement(uuid, text, numeric, numeric, numeric, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_reservation_transfer(uuid) TO authenticated, service_role;