-- Anonymous financial shapes of the 12 active cases reviewed on 2026-11-13.
-- Local disposable PostgreSQL only. No production identifiers, people or receipts.
-- Run from repository root with run_cc_0111_twelve_cases_local.sh.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION public.qa_cc0111_case(_n integer,_precio numeric,_mp_amount numeric,_imputado numeric)
RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  a uuid:=('01110000-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid;
  p uuid:=('01110100-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid;
  s uuid:=('01110200-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid;
  m uuid:=('01110300-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid;
BEGIN
  INSERT INTO public.planes(id,nombre,precio,moneda) VALUES(p,'QA anonymous '||_n,_precio,'ARS');
  INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
    VALUES(s,a,p,_precio,'pendiente','pendiente','cargado_admin');
  INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
    VALUES(m,('01110400-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid,'QA-0111-'||_n,a,_mp_amount,'ARS','ingreso','approved');
  INSERT INTO public.pagos_imputaciones(pago_origen_tipo,pago_origen_id,obligacion_tipo,obligacion_id,alumno_id,monto,moneda)
    VALUES('mp_movement',m,'suscripcion',s,a,_imputado,'ARS');
  UPDATE public.suscripciones SET estado='finalizada',metodo_pago='transferencia' WHERE id=s;
  RETURN a;
END $$;

CREATE FUNCTION public.qa_cc0111_credit(_n integer,_monto numeric,_tipo text,_referencia text DEFAULT NULL)
RETURNS void LANGUAGE sql SET search_path=public AS $$
  INSERT INTO public.cuenta_ajustes(alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id,concepto,
    aplicado_a_fuente_tabla,aplicado_a_fuente_id)
  VALUES(('01110000-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid,'credito',_monto,'ARS',_referencia,
    CASE WHEN _referencia IS NULL THEN NULL ELSE ('01110400-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid END,
    'QA anonymous historical shape',CASE WHEN _tipo='applied' THEN 'suscripciones' END,
    CASE WHEN _tipo='applied' THEN ('01110200-0000-0000-0000-'||lpad(_n::text,12,'0'))::uuid END);
$$;

-- n, price, source amount, active imputation.
SELECT public.qa_cc0111_case(1,71240,71240,71240);       -- applied credit without independent reference
SELECT public.qa_cc0111_case(2,65500,65500,65500);
SELECT public.qa_cc0111_case(3,83500,83500,83500);       -- applied credit without independent reference
SELECT public.qa_cc0111_case(4,65500,65500,65500);
SELECT public.qa_cc0111_case(5,83500,83500,83500);
SELECT public.qa_cc0111_case(6,65500,65500,65500);       -- applied credit without independent reference
SELECT public.qa_cc0111_case(7,83500,83500,83500);       -- free credit representing the same MP
SELECT public.qa_cc0111_case(8,71240,241637.60,64600);   -- free credit, larger source and genuine remainder
SELECT public.qa_cc0111_case(9,83500,76472,76472);       -- independent complement on another operation
SELECT public.qa_cc0111_case(10,71240,68476,68476);      -- free credit representing the same MP
SELECT public.qa_cc0111_case(11,71240,136952,71240);     -- source remainder stays distributable
SELECT public.qa_cc0111_case(12,83500,83500,83500);

-- These rows reproduce already-existing history; current guards correctly block creating some of it now.
ALTER TABLE public.cuenta_ajustes DISABLE TRIGGER trg_guard_credit_mp_budget;
SELECT public.qa_cc0111_credit(1,71115,'applied');
SELECT public.qa_cc0111_credit(3,83500,'applied');
SELECT public.qa_cc0111_credit(6,65500,'applied');
SELECT public.qa_cc0111_credit(7,83500,'free','QA-0111-7');
SELECT public.qa_cc0111_credit(8,241637.60,'free','QA-0111-8');
SELECT public.qa_cc0111_credit(10,68476,'free','QA-0111-10');

-- Case 9: independent MP operation fully pays another obligation; ARS 7,028 is its documented complement.
INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
VALUES('01110200-0000-0000-0000-000000000109',
  '01110000-0000-0000-0000-000000000009','01110100-0000-0000-0000-000000000009',
  87238,'finalizada','mercadopago','cargado_admin');
INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,suscripcion_id,amount,currency,direccion,status)
VALUES('01110300-0000-0000-0000-000000000109','01110400-0000-0000-0000-000000000009',
  'QA-0111-9-INDEPENDENT','01110000-0000-0000-0000-000000000009',
  '01110200-0000-0000-0000-000000000109',87238,'ARS','ingreso','approved');
SELECT public.qa_cc0111_credit(9,7028,'applied','QA-0111-9-INDEPENDENT');
ALTER TABLE public.cuenta_ajustes ENABLE TRIGGER trg_guard_credit_mp_budget;

CREATE TEMP TABLE qa_before AS
SELECT m.alumno_id,m.moneda,sum(m.debe) debe,sum(m.haber) haber,sum(m.debe-m.haber) saldo
FROM public.vw_cuenta_corriente_movimientos m
WHERE m.alumno_id BETWEEN '01110000-0000-0000-0000-000000000001' AND '01110000-0000-0000-0000-000000000012'
GROUP BY m.alumno_id,m.moneda;

CREATE TEMP TABLE qa_expected(n integer PRIMARY KEY,saldo_antes numeric,saldo_despues numeric);
INSERT INTO qa_expected VALUES
 (1,-71240,0),(2,-65500,0),(3,-83500,0),(4,-65500,0),
 (5,-83500,0),(6,-65500,0),(7,-83500,0),(8,-241637.60,-177037.60),
 (9,-76472,0),(10,-68476,0),(11,-71240,0),(12,-83500,0);

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM qa_expected e JOIN qa_before b ON b.alumno_id=('01110000-0000-0000-0000-'||lpad(e.n::text,12,'0'))::uuid
    WHERE b.moneda<>'ARS' OR b.saldo IS DISTINCT FROM e.saldo_antes) THEN
    RAISE EXCEPTION 'Anonymous baseline does not match the 12 reviewed shapes';
  END IF;
  IF (SELECT count(*) FROM qa_before)<>12 THEN RAISE EXCEPTION 'Expected 12 baseline accounts'; END IF;
END $$;

\i sql/pending/0111_cc_subscription_imputation_dedup.sql

CREATE TEMP TABLE qa_after AS
SELECT m.alumno_id,m.moneda,sum(m.debe) debe,sum(m.haber) haber,sum(m.debe-m.haber) saldo
FROM public.vw_cuenta_corriente_movimientos m
WHERE m.alumno_id BETWEEN '01110000-0000-0000-0000-000000000001' AND '01110000-0000-0000-0000-000000000012'
GROUP BY m.alumno_id,m.moneda;

SELECT e.n AS caso,CASE WHEN b.saldo=e.saldo_antes AND a.saldo=e.saldo_despues THEN 'PASS' ELSE 'FAIL' END estado,
  b.haber haber_antes,a.haber haber_despues,b.saldo saldo_antes,a.saldo saldo_despues,
  a.haber-b.haber reduccion_haber
FROM qa_expected e
JOIN qa_before b ON b.alumno_id=('01110000-0000-0000-0000-'||lpad(e.n::text,12,'0'))::uuid
JOIN qa_after a ON a.alumno_id=b.alumno_id AND a.moneda=b.moneda
ORDER BY e.n;

DO $$
DECLARE v_delta numeric;
BEGIN
  IF EXISTS(SELECT 1 FROM qa_expected e JOIN qa_before b ON b.alumno_id=('01110000-0000-0000-0000-'||lpad(e.n::text,12,'0'))::uuid
    JOIN qa_after a ON a.alumno_id=b.alumno_id AND a.moneda=b.moneda
    WHERE b.saldo IS DISTINCT FROM e.saldo_antes OR a.saldo IS DISTINCT FROM e.saldo_despues) THEN
    RAISE EXCEPTION 'Candidate after-balances differ from expected reconciliation';
  END IF;
  SELECT sum(a.haber-b.haber) INTO v_delta FROM qa_before b JOIN qa_after a ON a.alumno_id=b.alumno_id AND a.moneda=b.moneda;
  IF v_delta IS DISTINCT FROM -882528 THEN RAISE EXCEPTION 'Expected ARS -882528 delta, got %',v_delta; END IF;
  IF (SELECT saldo FROM qa_after WHERE alumno_id='01110000-0000-0000-0000-000000000008') IS DISTINCT FROM -177037.60 THEN
    RAISE EXCEPTION 'Genuine Mateo-shaped remainder disappeared';
  END IF;
  IF public.pago_saldo_disponible('mp_movement','01110300-0000-0000-0000-000000000011') IS DISTINCT FROM 65712 THEN
    RAISE EXCEPTION 'Unallocated source remainder changed';
  END IF;
END $$;

\i sql/pending/0111_cc_subscription_imputation_dedup_rollback.sql

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM qa_before b JOIN public.vw_cuenta_corriente_movimientos m ON m.alumno_id=b.alumno_id AND m.moneda=b.moneda
    GROUP BY b.alumno_id,b.moneda,b.debe,b.haber,b.saldo
    HAVING sum(m.debe) IS DISTINCT FROM b.debe OR sum(m.haber) IS DISTINCT FROM b.haber OR sum(m.debe-m.haber) IS DISTINCT FROM b.saldo) THEN
    RAISE EXCEPTION 'Rollback did not restore the baseline';
  END IF;
END $$;

SELECT 'PASS' estado,'12/12 formas conciliadas; delta ARS -882528; remanentes preservados; rollback restaura baseline' detalle;
ROLLBACK;
