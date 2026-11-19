-- 0116: conciliación aprobada de créditos de Training Camp (flujo admin-only, atómico e idempotente)
-- + ejecución del caso Louys/Hamui (San Luis 2026 -> Emilia Romagna 2027). Crédito interno: no es caja ni facturable.

CREATE TABLE IF NOT EXISTS public.training_camp_credit_conciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  target_reservation_id uuid NOT NULL REFERENCES public.event_reservations(id),
  total_ars numeric(14,2) NOT NULL CHECK (total_ars > 0),
  fx_ars_per_unit numeric(14,4) NOT NULL CHECK (fx_ars_per_unit > 0),
  recognized_amount numeric(14,2) NOT NULL CHECK (recognized_amount > 0),
  recognized_currency text NOT NULL,
  expected_target_total numeric(14,2) NOT NULL,
  expected_target_paid_before numeric(14,2) NOT NULL,
  authorization_note text NOT NULL,
  authorized_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'aprobada' CHECK (status IN ('aprobada','ejecutada')),
  payment_id uuid REFERENCES public.reservation_payments(id),
  executed_by uuid,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.training_camp_credit_conciliation_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conciliation_id uuid NOT NULL REFERENCES public.training_camp_credit_conciliations(id),
  source_reservation_id uuid NOT NULL UNIQUE REFERENCES public.event_reservations(id),
  holder_alumno_id uuid NOT NULL,
  amount_ars numeric(14,2) NOT NULL CHECK (amount_ars > 0),
  is_cession boolean NOT NULL DEFAULT false,
  note text
);
GRANT SELECT ON public.training_camp_credit_conciliations, public.training_camp_credit_conciliation_sources TO authenticated;
GRANT ALL ON public.training_camp_credit_conciliations, public.training_camp_credit_conciliation_sources TO service_role;
ALTER TABLE public.training_camp_credit_conciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_camp_credit_conciliation_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camp_conc_admin ON public.training_camp_credit_conciliations;
CREATE POLICY camp_conc_admin ON public.training_camp_credit_conciliations FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid()));
DROP POLICY IF EXISTS camp_conc_src_admin ON public.training_camp_credit_conciliation_sources;
CREATE POLICY camp_conc_src_admin ON public.training_camp_credit_conciliation_sources FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid()));

ALTER TABLE public.training_camp_credit_ledger ADD COLUMN IF NOT EXISTS conciliation_id uuid REFERENCES public.training_camp_credit_conciliations(id);

-- Guard: sigue bloqueado salvo dentro de la ejecución de una conciliación aprobada (GUC local a la transacción).
CREATE OR REPLACE FUNCTION public.rescheduling_finance_locked()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v text := current_setting('reybaud.camp_credit_conciliation', true);
BEGIN
  IF TG_OP = 'INSERT' AND v IS NOT NULL AND v <> '' AND EXISTS (
       SELECT 1 FROM training_camp_credit_conciliations WHERE id::text = v AND status = 'aprobada') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'training_camp_credit_accounts' AND v IS NOT NULL AND v <> '' AND EXISTS (
       SELECT 1 FROM training_camp_credit_conciliations WHERE id::text = v AND status = 'aprobada') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Operaciones financieras bloqueadas: falta integración y conciliación aprobada';
END $function$;

-- Pagos "credito_interevento": solo creables dentro de una conciliación; inmutables después.
CREATE OR REPLACE FUNCTION public.guard_interevent_credit_payment()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v text := current_setting('reybaud.camp_credit_conciliation', true);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.payment_method = 'credito_interevento' THEN
    IF v IS NULL OR v = '' OR NOT EXISTS (SELECT 1 FROM training_camp_credit_conciliations WHERE id::text = v AND status='aprobada') THEN
      RAISE EXCEPTION 'Los créditos interevento solo se registran mediante una conciliación aprobada';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND (OLD.payment_method = 'credito_interevento' OR NEW.payment_method = 'credito_interevento') THEN
    RAISE EXCEPTION 'Un crédito interevento conciliado no puede modificarse';
  ELSIF TG_OP = 'DELETE' AND OLD.payment_method = 'credito_interevento' THEN
    RAISE EXCEPTION 'Un crédito interevento conciliado no puede eliminarse';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
DROP TRIGGER IF EXISTS aaa_guard_interevent_credit_payment ON public.reservation_payments;
CREATE TRIGGER aaa_guard_interevent_credit_payment BEFORE INSERT OR UPDATE OR DELETE ON public.reservation_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_interevent_credit_payment();

-- Facturación: un crédito interevento nunca entra en facturacion_cola. Reportes de ingresos lo excluyen.
DO $$
DECLARE d text; n text; vname text;
BEGIN
  d := pg_get_functiondef('public.enqueue_reservation_payment_facturacion'::regproc);
  IF position('credito_interevento' in d) = 0 THEN
    n := replace(d, E'BEGIN\n  IF NEW.status = ''validado''', E'BEGIN\n  IF NEW.payment_method = ''credito_interevento'' THEN RETURN NEW; END IF;\n  IF NEW.status = ''validado''');
    IF n = d THEN RAISE EXCEPTION 'No se pudo parchear enqueue_reservation_payment_facturacion'; END IF;
    EXECUTE n;
  END IF;

  FOREACH vname IN ARRAY ARRAY['v_ingresos_netos','vw_backfill_ingresos'] LOOP
    d := pg_get_viewdef(('public.'||vname)::regclass);
    IF position('credito_interevento' in d) = 0 THEN
      IF vname = 'v_ingresos_netos' THEN
        n := replace(d, $r$WHERE ((rp.status = 'validado'::text) AND (COALESCE((rp.anulado_at)::text, ''::text) = ''::text))$r$,
                        $r$WHERE ((rp.status = 'validado'::text) AND (COALESCE((rp.anulado_at)::text, ''::text) = ''::text) AND (rp.payment_method IS DISTINCT FROM 'credito_interevento'::text))$r$);
      ELSE
        n := replace(d, $r$WHERE ((rp.status = 'validado'::text) AND (rp.anulado_at IS NULL) AND$r$,
                        $r$WHERE ((rp.status = 'validado'::text) AND (rp.anulado_at IS NULL) AND (rp.payment_method IS DISTINCT FROM 'credito_interevento'::text) AND$r$);
      END IF;
      IF n = d THEN RAISE EXCEPTION 'No se pudo parchear %', vname; END IF;
      EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', vname, n);
    END IF;
  END LOOP;

  d := pg_get_viewdef('public.vw_conciliacion_pagos'::regclass);
  IF position('credito_interevento' in d) = 0 THEN
    n := replace(d, E'LEFT JOIN events e ON ((e.id = er.event_id)))\nUNION ALL\n SELECT ''tienda''',
                    E'LEFT JOIN events e ON ((e.id = er.event_id)))\n  WHERE (rp.payment_method IS DISTINCT FROM ''credito_interevento''::text)\nUNION ALL\n SELECT ''tienda''');
    IF n = d THEN RAISE EXCEPTION 'No se pudo parchear vw_conciliacion_pagos'; END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.vw_conciliacion_pagos AS ' || n;
  END IF;
END $$;

-- Ejecución atómica e idempotente (interna).
CREATE OR REPLACE FUNCTION public._execute_camp_credit_conciliation(p_id uuid, p_actor uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record; s record; t record; v_paid numeric; v_ref numeric; v_used numeric; v_sum numeric := 0;
        v_acc uuid; v_pay uuid; v_issue uuid; v_cnt int;
BEGIN
  SELECT * INTO c FROM training_camp_credit_conciliations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conciliación inexistente'; END IF;
  IF c.status = 'ejecutada' THEN RETURN c.payment_id; END IF;
  IF p_actor IS NULL OR NOT is_super_admin(p_actor) THEN RAISE EXCEPTION 'Actor no autorizado'; END IF;
  IF round(c.total_ars / c.fx_ars_per_unit, 2) <> c.recognized_amount THEN RAISE EXCEPTION 'Tipo de cambio inconsistente'; END IF;

  SELECT * INTO t FROM event_reservations WHERE id = c.target_reservation_id FOR UPDATE;
  IF t.currency_snapshot IS DISTINCT FROM c.recognized_currency OR t.amount_total <> c.expected_target_total
     OR t.amount_paid <> c.expected_target_paid_before THEN
    RAISE EXCEPTION 'Destino cambió desde la auditoría (total %, pagado %)', t.amount_total, t.amount_paid;
  END IF;
  IF EXISTS (SELECT 1 FROM reservation_payments WHERE reservation_id = t.id AND payment_method = 'credito_interevento') THEN
    RAISE EXCEPTION 'El destino ya tiene un crédito interevento';
  END IF;

  PERFORM set_config('reybaud.camp_credit_conciliation', c.id::text, true);

  FOR s IN SELECT * FROM training_camp_credit_conciliation_sources WHERE conciliation_id = c.id ORDER BY source_reservation_id LOOP
    PERFORM 1 FROM event_reservations WHERE id = s.source_reservation_id AND reservation_status = 'cancelada' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Origen % no está cancelado', s.source_reservation_id; END IF;
    SELECT coalesce(sum(amount),0) INTO v_paid FROM reservation_payments
      WHERE reservation_id = s.source_reservation_id AND status='validado' AND anulado_at IS NULL AND currency='ARS';
    SELECT coalesce(sum(monto),0) INTO v_ref FROM devoluciones
      WHERE moneda='ARS' AND (reservation_id = s.source_reservation_id OR reservation_payment_id IN (SELECT id FROM reservation_payments WHERE reservation_id = s.source_reservation_id));
    SELECT coalesce(sum(l.amount),0) INTO v_used FROM training_camp_credit_ledger l JOIN training_camp_credit_accounts a ON a.id=l.account_id
      WHERE a.source_reservation_id = s.source_reservation_id AND l.kind='apply';
    IF v_paid - v_ref - v_used <> s.amount_ars THEN
      RAISE EXCEPTION 'Saldo de origen % no coincide: disponible %, esperado %', s.source_reservation_id, v_paid - v_ref - v_used, s.amount_ars;
    END IF;
    INSERT INTO training_camp_credit_accounts (source_reservation_id, beneficiary_alumno_id, currency, balance)
      VALUES (s.source_reservation_id, s.holder_alumno_id, 'ARS', 0) RETURNING id INTO v_acc;
    INSERT INTO training_camp_credit_ledger (account_id, kind, amount, idempotency_key, actor_id, conciliation_id)
      VALUES (v_acc, 'issue', s.amount_ars, md5(c.reference||':issue:'||s.source_reservation_id)::uuid, p_actor, c.id) RETURNING id INTO v_issue;
    INSERT INTO training_camp_credit_ledger (account_id, kind, amount, target_reservation_id, idempotency_key, actor_id, conciliation_id)
      VALUES (v_acc, 'apply', s.amount_ars, t.id, md5(c.reference||':apply:'||s.source_reservation_id)::uuid, p_actor, c.id);
    UPDATE event_reservations SET admin_notes = concat_ws(E'\n', nullif(admin_notes,''),
      format('[%s] Crédito ARS %s consumido íntegramente %s en reserva %s (conciliación %s). Sin devolución ni ingreso de caja.',
        to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','DD/MM/YYYY'), s.amount_ars,
        CASE WHEN s.is_cession THEN 'por cesión autorizada' ELSE '' END, t.id, c.reference))
      WHERE id = s.source_reservation_id;
    v_sum := v_sum + s.amount_ars;
  END LOOP;
  IF v_sum <> c.total_ars THEN RAISE EXCEPTION 'Suma de orígenes % <> total %', v_sum, c.total_ars; END IF;

  INSERT INTO reservation_payments (reservation_id, alumno_id, amount, currency, payment_date, payment_method, payment_reference, notes,
     status, reviewed_at, reviewed_by, review_action, review_notes, original_amount, original_currency, exchange_rate_to_event_currency,
     equivalent_amount_event_currency, event_currency, obligation_amount_contract, fx_reference_rate, fx_base_amount, mp_explicit_installment)
  VALUES (t.id, t.alumno_id, c.recognized_amount, c.recognized_currency, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
     'credito_interevento', c.reference,
     'Traslado interno de crédito (no es caja, ni ingreso nuevo, ni facturable). ' || c.authorization_note,
     'validado', now(), p_actor, 'credito_interevento', 'Conciliación ' || c.reference,
     c.total_ars, 'ARS', round(1 / c.fx_ars_per_unit, 10), c.recognized_amount, c.recognized_currency, c.recognized_amount,
     c.fx_ars_per_unit, c.total_ars, false)
  RETURNING id INTO v_pay;

  PERFORM recalculate_reservation_payment_totals(t.id);

  SELECT count(*) INTO v_cnt FROM facturacion_cola WHERE referencia_id = v_pay;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'El crédito generó registro de facturación'; END IF;

  UPDATE training_camp_credit_conciliations SET status='ejecutada', payment_id=v_pay, executed_by=p_actor, executed_at=now() WHERE id=c.id;
  INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  SELECT p_actor, ap.email, ap.role::text, 'camp_credit_conciliation_executed', 'event_reservation', t.id,
         jsonb_build_object('conciliation_id', c.id, 'reference', c.reference, 'payment_id', v_pay, 'total_ars', c.total_ars,
           'fx', c.fx_ars_per_unit, 'recognized', c.recognized_amount, 'currency', c.recognized_currency,
           'sources', (SELECT jsonb_agg(jsonb_build_object('reservation', source_reservation_id, 'holder', holder_alumno_id, 'ars', amount_ars, 'cesion', is_cession))
                         FROM training_camp_credit_conciliation_sources WHERE conciliation_id=c.id),
           'authorization', c.authorization_note)
  FROM admin_profiles ap WHERE ap.user_id = p_actor;
  RETURN v_pay;
END $function$;
REVOKE ALL ON FUNCTION public._execute_camp_credit_conciliation(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Entrada admin: solo super_admin, solo conciliaciones ya aprobadas (cargadas por Administración vía migración).
CREATE OR REPLACE FUNCTION public.admin_execute_camp_credit_conciliation(p_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Solo super administración'; END IF;
  RETURN _execute_camp_credit_conciliation(p_id, auth.uid());
END $function$;
REVOKE ALL ON FUNCTION public.admin_execute_camp_credit_conciliation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_execute_camp_credit_conciliation(uuid) TO authenticated;

-- Caso aprobado: Louys + cesión Hamui -> Emilia Romagna 2027.
DO $$
DECLARE v_id uuid; v_scarlett uuid := '0d70cac6-b7ff-4041-a90e-d40614f39622';
BEGIN
  INSERT INTO training_camp_credit_conciliations (reference, target_reservation_id, total_ars, fx_ars_per_unit, recognized_amount,
     recognized_currency, expected_target_total, expected_target_paid_before, authorization_note, authorized_by)
  VALUES ('TC-SL2026-ER2027-LOUYS-HAMUI', 'aa5dc95c-0f9c-41e3-b7ff-870199d5fa3a', 1099000, 1895.2899, 579.86, 'EUR', 2709.61, 750,
     'Autorizado por Scarlett (super admin) el 19/11/2026: saldo Louys ARS 120.000 (tras devoluciones MP ARS 859.000) + cesión de Marcelo Hamui ARS 979.000 a María Eugenia Louys, confirmada por el titular vía Scarlett.',
     v_scarlett)
  ON CONFLICT (reference) DO NOTHING;
  SELECT id INTO v_id FROM training_camp_credit_conciliations WHERE reference = 'TC-SL2026-ER2027-LOUYS-HAMUI';
  INSERT INTO training_camp_credit_conciliation_sources (conciliation_id, source_reservation_id, holder_alumno_id, amount_ars, is_cession, note) VALUES
    (v_id, '7de2869e-1b0b-44a6-aff9-8395e77828cd', 'f579bf65-74b8-40c1-95fe-ecbe79741102', 120000, false, 'Saldo propio de Eugenia Louys'),
    (v_id, '958a8477-1585-446a-805b-d477e525515c', 'a21da55c-82a7-449f-8bd5-599ff51819e7', 979000, true, 'Cesión de Marcelo Hamui a María Eugenia Louys')
  ON CONFLICT (source_reservation_id) DO NOTHING;
  PERFORM public._execute_camp_credit_conciliation(v_id, v_scarlett);
END $$;
