-- Esquema mínimo aislado (PostgreSQL desechable) con las mismas columnas y triggers
-- relevantes de producción para pagos de reservas. Nunca se ejecuta contra Lovable Cloud.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE events (id uuid PRIMARY KEY, currency text);
CREATE TABLE event_reservations (
  id uuid PRIMARY KEY, event_id uuid, alumno_id uuid, amount_total numeric, amount_paid numeric DEFAULT 0,
  balance_due numeric, payment_status text, reservation_status text DEFAULT 'solicitud_enviada', estado text,
  confirmed_at timestamptz, cancelled_at timestamptz, metodo_pago text, currency_snapshot text, moneda text,
  updated_at timestamptz);
CREATE TABLE reservation_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid, installment_number int, amount numeric,
  due_date date, status text DEFAULT 'pendiente', paid_amount numeric DEFAULT 0, balance_due numeric,
  condoned_amount numeric, monto_pagado numeric, saldo_pendiente numeric, created_at timestamptz DEFAULT now(),
  updated_at timestamptz);
CREATE TABLE reservation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid, alumno_id uuid, amount numeric, currency text,
  payment_date date, payment_method text, payment_reference text, mp_payment_id text, notes text, status text,
  equivalent_amount_event_currency numeric, exchange_rate_to_event_currency numeric, installment_id uuid,
  installment_number int, anulado_at timestamptz, review_action text, reviewed_at timestamptz,
  created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE reservation_transfer_direct_payments (replacement_reservation_id uuid, amount numeric, status text);
CREATE TABLE mp_account_movements (mp_payment_id text, reservation_payment_id uuid, suscripcion_id uuid);

CREATE FUNCTION direct_confirmed_for_replacement(p_reservation_id uuid) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(amount),0) FROM reservation_transfer_direct_payments
  WHERE replacement_reservation_id = p_reservation_id AND status = 'confirmed' $$;
-- Copias literales de producción:
CREATE FUNCTION apply_direct_payments_to_installment() RETURNS trigger LANGUAGE plpgsql AS $f$
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
  NEW.balance_due := v_bal; NEW.saldo_pendiente := v_bal;
  IF v_bal <= 0.01 AND COALESCE(NEW.amount,0) > 0 THEN NEW.status := 'pagada'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_apply_direct_payments_installment BEFORE INSERT OR UPDATE ON reservation_installments
  FOR EACH ROW EXECUTE FUNCTION apply_direct_payments_to_installment();
CREATE FUNCTION apply_direct_payments_to_reservation_balance() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE v_direct numeric;
BEGIN
  v_direct := direct_confirmed_for_replacement(NEW.id);
  IF v_direct > 0 AND NEW.amount_total IS NOT NULL THEN
    NEW.balance_due := GREATEST(NEW.amount_total - COALESCE(NEW.amount_paid,0) - v_direct, 0);
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_apply_direct_payments_balance BEFORE INSERT OR UPDATE ON event_reservations
  FOR EACH ROW EXECUTE FUNCTION apply_direct_payments_to_reservation_balance();
CREATE FUNCTION fill_payment_equivalent_amount() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE v_event_currency text;
BEGIN
  IF NEW.equivalent_amount_event_currency IS NULL THEN
    SELECT COALESCE(r.currency_snapshot, e.currency, 'ARS') INTO v_event_currency
    FROM event_reservations r LEFT JOIN events e ON e.id = r.event_id WHERE r.id = NEW.reservation_id;
    IF COALESCE(NEW.currency, v_event_currency) = v_event_currency THEN
      NEW.equivalent_amount_event_currency := NEW.amount;
      NEW.exchange_rate_to_event_currency := COALESCE(NEW.exchange_rate_to_event_currency, 1);
    END IF;
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_fill_payment_equivalent_amount BEFORE INSERT OR UPDATE ON reservation_payments
  FOR EACH ROW EXECUTE FUNCTION fill_payment_equivalent_amount();

-- helper: reserva + cuotas
CREATE FUNCTION t_res(p_id uuid, p_total numeric, p_insts numeric[], p_cur text DEFAULT 'ARS') RETURNS void LANGUAGE plpgsql AS $f$
DECLARE i int;
BEGIN
  INSERT INTO event_reservations(id, amount_total, balance_due, currency_snapshot) VALUES (p_id, p_total, p_total, p_cur);
  FOR i IN 1..coalesce(array_length(p_insts,1),0) LOOP
    INSERT INTO reservation_installments(reservation_id, installment_number, amount, balance_due, due_date)
    VALUES (p_id, i-1, p_insts[i], p_insts[i], date '2026-07-01' + i);
  END LOOP;
END $f$;

-- Triggers vigentes adicionales sobre reservation_payments (copias de producción; la alerta
-- de transferencias se omite: en producción está envuelta en BEGIN/EXCEPTION y no afecta pagos).
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TYPE app_role AS ENUM ('admin','alumno','coach','deposito');
CREATE FUNCTION has_role(uuid, app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION is_super_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
ALTER TABLE event_reservations ADD COLUMN terminos_pendientes boolean DEFAULT false;
ALTER TABLE events ADD COLUMN title text;
ALTER TABLE reservation_payments ADD COLUMN anulado_motivo text;
CREATE TABLE alumnos (id uuid PRIMARY KEY, nombre text, apellido text, nombre_fiscal text, documento text);
CREATE TABLE facturacion_cola (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text, pago_id text, referencia_tipo text, referencia_id uuid,
  alumno_id uuid, cliente_nombre text, cliente_cuit text, concepto text, monto numeric, moneda text, segmento text,
  metodo_pago text, origen_registro text, pagado_at timestamptz, periodo_pago date, periodo_operativo date,
  ingreso text, estado text DEFAULT 'pendiente', notas text, updated_at timestamptz,
  UNIQUE (referencia_tipo, referencia_id, pago_id));
CREATE TABLE reservation_transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), replacement_reservation_id uuid,
  status text, agreement_defined_at timestamptz, deposit_paid_at timestamptz, deposit_amount numeric, updated_at timestamptz);

CREATE FUNCTION trg_block_payment_terms_pending() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.status = 'validado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validado')
     AND auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
     AND EXISTS (SELECT 1 FROM public.event_reservations WHERE id = NEW.reservation_id AND terminos_pendientes)
  THEN RAISE EXCEPTION 'Condiciones pendientes'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_block_payment_terms_pending BEFORE INSERT OR UPDATE OF status ON reservation_payments
  FOR EACH ROW EXECUTE FUNCTION trg_block_payment_terms_pending();

CREATE FUNCTION enqueue_reservation_payment_facturacion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alumno_nombre text; v_alumno_doc text; v_evento_nombre text; v_pago_id text;
BEGIN
  IF NEW.status = 'validado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validado') THEN
    BEGIN
      v_pago_id := COALESCE(NEW.mp_payment_id, 'reservation:' || NEW.id::text);
      SELECT COALESCE(NULLIF(TRIM(a.nombre_fiscal),''), NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'), a.documento
        INTO v_alumno_nombre, v_alumno_doc FROM public.alumnos a WHERE a.id = NEW.alumno_id;
      SELECT e.title INTO v_evento_nombre FROM public.event_reservations r LEFT JOIN public.events e ON e.id = r.event_id WHERE r.id = NEW.reservation_id;
      INSERT INTO public.facturacion_cola (source, pago_id, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto,
        monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, periodo_pago, periodo_operativo, ingreso)
      VALUES ('reservation_payment', v_pago_id, 'reservation_payment', NEW.id, NEW.alumno_id,
        COALESCE(v_alumno_nombre, '—'), v_alumno_doc, CONCAT('Evento ', COALESCE(v_evento_nombre, '')),
        COALESCE(NEW.amount, 0)::numeric, COALESCE(NEW.currency, 'ARS'), 'viajes',
        COALESCE(NEW.payment_method, 'efectivo'), 'reservation', COALESCE(NEW.reviewed_at, NEW.created_at),
        date_trunc('month', (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
        date_trunc('month', (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
        'automatico')
      ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'facturacion_cola reserva %: %', NEW.id, SQLERRM;
    END;
  END IF;
  IF NEW.anulado_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.anulado_at IS NULL) THEN
    UPDATE public.facturacion_cola SET estado = 'excluida', notas = COALESCE(notas || ' | ', '') || 'Pago anulado: ' || COALESCE(NEW.anulado_motivo, ''), updated_at = now()
    WHERE referencia_tipo = 'reservation_payment' AND referencia_id = NEW.id AND estado = 'pendiente';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_reservation_payments_facturacion AFTER INSERT OR UPDATE ON reservation_payments
  FOR EACH ROW EXECUTE FUNCTION enqueue_reservation_payment_facturacion();

CREATE FUNCTION trg_transfer_deposit_paid() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE t record;
BEGIN
  IF NEW.status <> 'validado' OR NEW.anulado_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'validado' THEN RETURN NEW; END IF;
  SELECT * INTO t FROM reservation_transfers WHERE replacement_reservation_id = NEW.reservation_id
     AND status IN ('reserved','deposit_paid') AND agreement_defined_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  UPDATE reservation_transfers SET status = 'payment_agreement_pending', deposit_paid_at = now(),
         deposit_amount = COALESCE(NEW.equivalent_amount_event_currency, NEW.amount, 0), updated_at = now() WHERE id = t.id;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_reservation_transfer_deposit_paid AFTER INSERT OR UPDATE OF status ON reservation_payments
  FOR EACH ROW EXECUTE FUNCTION trg_transfer_deposit_paid();
