CREATE TABLE public.reservation_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_reservation_id uuid NOT NULL REFERENCES public.event_reservations(id),
  replacement_reservation_id uuid NULL REFERENCES public.event_reservations(id),
  event_id uuid NOT NULL,
  package_id uuid NULL,
  status text NOT NULL DEFAULT 'listed' CHECK (status IN ('listed','reserved','deposit_paid','payment_agreement_pending','payment_agreement_defined','completed','cancelled')),
  payment_mode text NULL CHECK (payment_mode IS NULL OR payment_mode IN ('direct_to_original','reybaud','mixed')),
  original_previous_status text NULL,
  original_paid_amount numeric NOT NULL DEFAULT 0,
  amount_to_original numeric NOT NULL DEFAULT 0,
  amount_to_reybaud numeric NOT NULL DEFAULT 0,
  direct_payment_amount numeric NOT NULL DEFAULT 0,
  reybaud_refund_amount numeric NOT NULL DEFAULT 0,
  admin_contacted_at timestamptz,
  agreement_defined_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_transfers_not_self CHECK (replacement_reservation_id IS NULL OR replacement_reservation_id <> original_reservation_id)
);
CREATE UNIQUE INDEX reservation_transfers_one_active_original ON public.reservation_transfers(original_reservation_id) WHERE status NOT IN ('completed','cancelled');
CREATE UNIQUE INDEX reservation_transfers_one_active_replacement ON public.reservation_transfers(replacement_reservation_id) WHERE replacement_reservation_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX reservation_transfers_event_pkg_status ON public.reservation_transfers(event_id, package_id, status, created_at);

GRANT SELECT ON public.reservation_transfers TO authenticated;
GRANT ALL ON public.reservation_transfers TO service_role;
ALTER TABLE public.reservation_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read reservation transfers" ON public.reservation_transfers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.start_reservation_transfer(p_original_reservation_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_id uuid; v_rel jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO r FROM event_reservations WHERE id = p_original_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF r.reservation_status IN ('cancelada','rechazada','expirada') THEN RAISE EXCEPTION 'La reserva ya está cancelada/rechazada'; END IF;
  IF EXISTS (SELECT 1 FROM reservation_transfers WHERE original_reservation_id = r.id AND status NOT IN ('completed','cancelled')) THEN
    RAISE EXCEPTION 'La reserva ya tiene un cupo en reventa activo'; END IF;
  IF EXISTS (SELECT 1 FROM reservation_transfers WHERE replacement_reservation_id = r.id AND status NOT IN ('completed','cancelled')) THEN
    RAISE EXCEPTION 'La reserva es reemplazo de una transferencia en curso'; END IF;

  INSERT INTO reservation_transfers (original_reservation_id, event_id, package_id, status, original_previous_status, original_paid_amount, notes)
  VALUES (r.id, r.event_id, r.package_id, 'listed', r.reservation_status, COALESCE(r.amount_paid,0), p_notes)
  RETURNING id INTO v_id;

  -- Deja de contar como activa (disponibilidad/rooming/deudas excluyen 'cancelada'); la UI deriva "Cupo en reventa" desde reservation_transfers.
  UPDATE event_reservations SET reservation_status = 'cancelada', updated_at = now() WHERE id = r.id;
  INSERT INTO reservation_status_history (reservation_id, old_reservation_status, new_reservation_status, changed_by, changed_by_role, note)
  VALUES (r.id, r.reservation_status, 'cancelada', auth.uid(), 'admin', 'Cupo liberado para reventa (transferencia ' || v_id::text || ')');

  v_rel := release_room_on_cancel(r.id, true);
  IF COALESCE((v_rel->>'had_room')::boolean, false) = false AND r.package_id IS NOT NULL THEN
    UPDATE event_packages SET activo = true, updated_at = now() WHERE id = r.package_id AND activo IS DISTINCT FROM true;
    UPDATE events SET status = 'publicado', updated_at = now() WHERE id = r.event_id AND status = 'agotado';
  END IF;

  INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'admin', 'reserva.transferencia.listada', 'reservation_transfer', v_id::text,
    jsonb_build_object('original_reservation_id', r.id, 'event_id', r.event_id, 'package_id', r.package_id,
      'previous_status', r.reservation_status, 'original_paid_amount', COALESCE(r.amount_paid,0), 'release', v_rel));
  RETURN jsonb_build_object('ok', true, 'transfer_id', v_id, 'release', v_rel);
END $$;

CREATE OR REPLACE FUNCTION public._claim_reservation_transfer_core(p_new_reservation_id uuid, p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n record; v_t uuid;
BEGIN
  SELECT id, event_id, package_id, reservation_status INTO n FROM event_reservations WHERE id = p_new_reservation_id;
  IF NOT FOUND OR n.reservation_status IN ('cancelada','rechazada','expirada') THEN RETURN NULL; END IF;
  SELECT id INTO v_t FROM reservation_transfers WHERE replacement_reservation_id = n.id AND status <> 'cancelled' LIMIT 1;
  IF v_t IS NOT NULL THEN RETURN v_t; END IF;
  IF EXISTS (SELECT 1 FROM reservation_transfers WHERE original_reservation_id = n.id) THEN RETURN NULL; END IF;
  SELECT id INTO v_t FROM reservation_transfers
   WHERE status = 'listed' AND replacement_reservation_id IS NULL AND event_id = n.event_id
     AND package_id IS NOT DISTINCT FROM n.package_id AND original_reservation_id <> n.id
   ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_t IS NULL THEN RETURN NULL; END IF;
  UPDATE reservation_transfers SET replacement_reservation_id = n.id, status = 'reserved', updated_at = now() WHERE id = v_t;
  INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), p_actor, 'reserva.transferencia.reclamada', 'reservation_transfer', v_t::text,
    jsonb_build_object('replacement_reservation_id', n.id, 'event_id', n.event_id, 'package_id', n.package_id));
  RETURN v_t;
END $$;
REVOKE ALL ON FUNCTION public._claim_reservation_transfer_core(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._claim_reservation_transfer_core(uuid, text) TO service_role;

-- Reclama desde cliente: admin, o el propio alumno dueño de la reserva recién creada.
CREATE OR REPLACE FUNCTION public.claim_reservation_transfer(p_new_reservation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_ok := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM event_reservations er JOIN alumnos a ON a.id = er.alumno_id
     WHERE er.id = p_new_reservation_id AND (a.user_id = auth.uid() OR lower(a.email) = lower(auth.email())));
  IF NOT v_ok THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN _claim_reservation_transfer_core(p_new_reservation_id,
    CASE WHEN has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()) THEN 'admin' ELSE 'alumno' END);
END $$;
REVOKE ALL ON FUNCTION public.claim_reservation_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_reservation_transfer(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_reservation_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_reservation_transfer(uuid, text) TO authenticated, service_role;