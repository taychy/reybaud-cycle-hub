-- 1) Validación de montos y fechas de pagos directos entre participantes
CREATE OR REPLACE FUNCTION public.validate_transfer_direct_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RAISE EXCEPTION 'El importe debe ser mayor a 0'; END IF;
    IF NEW.amount <> round(NEW.amount, 2) THEN
      RAISE EXCEPTION 'Importe mal formado (%): usá como máximo 2 decimales; los miles van sin punto', NEW.amount; END IF;
    IF NEW.paid_at IS NULL OR NEW.paid_at < DATE '2020-01-01' OR NEW.paid_at > (current_date + 1) THEN
      RAISE EXCEPTION 'Fecha de pago inválida (%)', NEW.paid_at; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_transfer_direct_payment ON public.reservation_transfer_direct_payments;
CREATE TRIGGER trg_validate_transfer_direct_payment
BEFORE INSERT OR UPDATE OF amount, paid_at, status ON public.reservation_transfer_direct_payments
FOR EACH ROW WHEN (NEW.status = 'confirmed') EXECUTE FUNCTION public.validate_transfer_direct_payment();

-- 2) Registro: rechaza duplicado exacto (idempotencia)
CREATE OR REPLACE FUNCTION public.register_reservation_transfer_direct_payment(p_transfer_id uuid, p_amount numeric, p_paid_at date, p_proof_path text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record; v_sum numeric; v_id uuid; v_cur text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO t FROM reservation_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferencia no encontrada'; END IF;
  IF t.replacement_reservation_id IS NULL THEN RAISE EXCEPTION 'La transferencia no tiene reemplazante'; END IF;
  IF t.agreement_defined_at IS NULL THEN RAISE EXCEPTION 'Primero definí el acuerdo de pago'; END IF;
  IF t.status IN ('cancelled','completed') THEN RAISE EXCEPTION 'Transferencia cerrada (%)', t.status; END IF;
  IF t.payment_mode NOT IN ('direct_to_original','mixed') THEN RAISE EXCEPTION 'El acuerdo no contempla pago directo'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El importe debe ser mayor a 0'; END IF;
  IF p_paid_at IS NULL THEN RAISE EXCEPTION 'Indicá la fecha del pago'; END IF;
  IF EXISTS (SELECT 1 FROM reservation_transfer_direct_payments WHERE transfer_id = t.id AND status = 'confirmed'
             AND amount = p_amount AND paid_at = p_paid_at) THEN
    RAISE EXCEPTION 'Ya existe un pago directo confirmado con el mismo importe y fecha'; END IF;
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
END $function$;

-- 3) Saldo guardado de la reserva reemplazante = total - pagos a Reybaud - pagos directos confirmados
CREATE OR REPLACE FUNCTION public.direct_confirmed_for_replacement(p_reservation_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(sum(amount),0) FROM reservation_transfer_direct_payments
  WHERE replacement_reservation_id = p_reservation_id AND status = 'confirmed'
$$;
REVOKE EXECUTE ON FUNCTION public.direct_confirmed_for_replacement(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.apply_direct_payments_to_reservation_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_direct numeric;
BEGIN
  v_direct := direct_confirmed_for_replacement(NEW.id);
  IF v_direct > 0 AND NEW.amount_total IS NOT NULL THEN
    NEW.balance_due := GREATEST(NEW.amount_total - COALESCE(NEW.amount_paid,0) - v_direct, 0);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_apply_direct_payments_balance ON public.event_reservations;
CREATE TRIGGER trg_apply_direct_payments_balance BEFORE INSERT OR UPDATE ON public.event_reservations
FOR EACH ROW EXECUTE FUNCTION public.apply_direct_payments_to_reservation_balance();

CREATE OR REPLACE FUNCTION public.apply_direct_payments_to_installment()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_direct numeric; v_prior numeric; v_own numeric; v_alloc numeric; v_bal numeric;
BEGIN
  v_direct := direct_confirmed_for_replacement(NEW.reservation_id);
  IF v_direct <= 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(GREATEST(amount - COALESCE(paid_amount,0),0)),0) INTO v_prior
    FROM reservation_installments WHERE reservation_id = NEW.reservation_id
     AND installment_number < NEW.installment_number AND id <> NEW.id;
  v_own := GREATEST(COALESCE(NEW.amount,0) - COALESCE(NEW.paid_amount,0), 0);
  v_alloc := LEAST(GREATEST(v_direct - v_prior, 0), v_own);
  v_bal := v_own - v_alloc;
  NEW.balance_due := v_bal;
  NEW.saldo_pendiente := v_bal;
  IF v_bal <= 0.01 AND COALESCE(NEW.amount,0) > 0 THEN NEW.status := 'pagada'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_apply_direct_payments_installment ON public.reservation_installments;
CREATE TRIGGER trg_apply_direct_payments_installment BEFORE INSERT OR UPDATE ON public.reservation_installments
FOR EACH ROW EXECUTE FUNCTION public.apply_direct_payments_to_installment();

CREATE OR REPLACE FUNCTION public.resync_after_direct_payment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res uuid := COALESCE(NEW.replacement_reservation_id, OLD.replacement_reservation_id);
BEGIN
  -- Recalcular saldo (sin tocar amount_paid: el pago directo no es caja Reybaud)
  UPDATE event_reservations SET balance_due = GREATEST(COALESCE(amount_total,0) - COALESCE(amount_paid,0), 0) WHERE id = v_res;
  UPDATE reservation_installments SET balance_due = GREATEST(COALESCE(amount,0) - COALESCE(paid_amount,0), 0) WHERE reservation_id = v_res;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_resync_after_direct_payment ON public.reservation_transfer_direct_payments;
CREATE TRIGGER trg_resync_after_direct_payment AFTER INSERT OR UPDATE OR DELETE ON public.reservation_transfer_direct_payments
FOR EACH ROW EXECUTE FUNCTION public.resync_after_direct_payment_change();

-- 4) Cuenta corriente: pago directo acredita al reemplazante y se descuenta del crédito del titular original (caja Reybaud $0)
DO $mig$
DECLARE v_def text;
BEGIN
  v_def := rtrim(pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass), E'; \n');
  IF position('pago_directo_reemplazo' in v_def) = 0 THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS ' || v_def || $b$
UNION ALL
 SELECT er.alumno_id, d.paid_at AS fecha, 'pago_directo_reemplazo'::text AS tipo,
   ('Pago directo al titular anterior — ' || COALESCE(e.title,'Evento')) AS concepto,
   'event_reservations'::text AS fuente_tabla, d.replacement_reservation_id AS fuente_id,
   0::numeric AS debe, d.amount AS haber, COALESCE(d.currency, er.currency_snapshot, 'ARS') AS moneda,
   d.status AS estado,
   jsonb_build_object('direct_payment_id', d.id, 'transfer_id', d.transfer_id, 'caja_reybaud', 0, 'original_reservation_id', d.original_reservation_id, 'notas', d.notes) AS referencia_extra
 FROM reservation_transfer_direct_payments d
 JOIN event_reservations er ON er.id = d.replacement_reservation_id
 LEFT JOIN events e ON e.id = er.event_id
 WHERE d.status = 'confirmed' AND er.alumno_id IS NOT NULL
UNION ALL
 SELECT er.alumno_id, d.paid_at AS fecha, 'reintegro_directo_recibido'::text AS tipo,
   ('Reintegro recibido del reemplazante — ' || COALESCE(e.title,'Evento')) AS concepto,
   'event_reservations'::text AS fuente_tabla, d.original_reservation_id AS fuente_id,
   d.amount AS debe, 0::numeric AS haber, COALESCE(d.currency, er.currency_snapshot, 'ARS') AS moneda,
   d.status AS estado,
   jsonb_build_object('direct_payment_id', d.id, 'transfer_id', d.transfer_id, 'caja_reybaud', 0, 'replacement_reservation_id', d.replacement_reservation_id, 'notas', d.notes) AS referencia_extra
 FROM reservation_transfer_direct_payments d
 JOIN event_reservations er ON er.id = d.original_reservation_id
 LEFT JOIN events e ON e.id = er.event_id
 WHERE d.status = 'confirmed' AND er.alumno_id IS NOT NULL
$b$;
  END IF;
END $mig$;