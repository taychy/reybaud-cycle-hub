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
