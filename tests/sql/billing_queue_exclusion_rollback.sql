-- Run with psql -X -v ON_ERROR_STOP=1 -f tests/sql/billing_queue_exclusion_rollback.sql
-- Synthetic queue/invoice rows only; no payment sources, ARCA, email or worker calls.
BEGIN;
-- Fixtures lack fiscal identity and use ingreso=rebuild: they can never become
-- automatically eligible, so no enqueue worker trigger is reached.
DO $test$
DECLARE
  admin_id uuid;
  q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid();
  ref1 uuid := gen_random_uuid(); ref2 uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid();
  n integer; blocked boolean; original_rows jsonb;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'An existing admin is required'; END IF;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO original_rows FROM public.facturacion_cola c;
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  INSERT INTO public.facturacion_cola(id,source,pago_id,referencia_tipo,referencia_id,concepto,monto,moneda,pagado_at,periodo_pago,periodo_operativo)
  VALUES (q1,'reservation_payment','qa:'||q1,'reservation_payment',ref1,'QA exclusion only',500,'EUR',now(),current_date,current_date),
         (q2,'reservation_payment','qa:'||q2,'reservation_payment',ref2,'QA exclusion only',100,'ARS',now(),current_date,current_date);
  IF EXISTS(SELECT 1 FROM public.facturacion_cola WHERE id IN(q1,q2) AND auto_estado='pendiente') THEN RAISE EXCEPTION 'Unsafe automatic fixture'; END IF;
  INSERT INTO public.facturas(id,cliente_nombre,concepto,monto,moneda,referencia_tipo,referencia_id,facturacion_cola_id)
  VALUES(f1,'QA synthetic','QA only',500,'EUR','reservation_payment',ref1,q1);
  -- Legacy prepared invoice has no direct queue ID.
  INSERT INTO public.facturas(id,cliente_nombre,concepto,monto,moneda,referencia_tipo,referencia_id)
  VALUES(f2,'QA synthetic','QA legacy only',100,'ARS','reservation_payment',ref2);

  n := public.admin_set_facturacion_exclusion(ARRAY[q1,q2], true);
  IF n <> 2 THEN RAISE EXCEPTION 'Batch exclusion failed'; END IF;
  IF (SELECT count(*) FROM public.facturacion_cola WHERE id IN(q1,q2) AND estado='excluida' AND excluida_facturacion AND auto_estado='excluida' AND exclusion_por=admin_id AND exclusion_at IS NOT NULL) <> 2 THEN RAISE EXCEPTION 'Exclusion/audit fields incorrect'; END IF;
  IF public.admin_set_facturacion_exclusion(ARRAY[q1,q2], true) <> 0 THEN RAISE EXCEPTION 'Replay not idempotent'; END IF;
  IF (SELECT count(*) FROM public.facturacion_cola_exclusion_log WHERE cola_id IN(q1,q2)) <> 2 THEN RAISE EXCEPTION 'Duplicate audit'; END IF;
  -- Simulate enqueue replay with the same deterministic source identity.
  INSERT INTO public.facturacion_cola(id,source,pago_id,referencia_tipo,referencia_id,concepto,monto,moneda,pagado_at,periodo_pago,periodo_operativo)
  VALUES(gen_random_uuid(),'reservation_payment','qa:'||q1,'reservation_payment',ref1,'QA replay',500,'EUR',now(),current_date,current_date)
  ON CONFLICT(referencia_tipo,referencia_id,pago_id) DO NOTHING;
  IF public.reevaluar_facturacion_cola(ARRAY[q1,q2]) <> 0 THEN RAISE EXCEPTION 'Reprocessing included excluded rows'; END IF;
  UPDATE public.facturacion_cola SET estado='pendiente', auto_estado='emitiendo', auto_reevaluar_at=clock_timestamp() WHERE id=q1;
  IF NOT EXISTS(SELECT 1 FROM public.facturacion_cola WHERE id=q1 AND estado='excluida' AND auto_estado='excluida') THEN RAISE EXCEPTION 'Exclusion did not survive rebuild/automatic claim'; END IF;
  IF position('NOT c2.excluida_facturacion' IN pg_get_functiondef('public.claim_facturacion_auto(integer)'::regprocedure))=0 THEN RAISE EXCEPTION 'Automatic claim is missing exclusion guard'; END IF;

  blocked:=false;
  BEGIN UPDATE public.facturas SET estado='emitiendo' WHERE id=f1;
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Excluded linked invoice claimed'; END IF;
  blocked:=false;
  BEGIN UPDATE public.facturas SET estado='emitiendo' WHERE id=f2;
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Excluded legacy invoice claimed'; END IF;
  blocked:=false;
  BEGIN INSERT INTO public.facturas(cliente_nombre,concepto,monto,referencia_tipo,referencia_id,facturacion_cola_id)
    VALUES('QA','QA',500,'reservation_payment',ref1,q1);
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Excluded draft creation allowed'; END IF;
  blocked:=false;
  BEGIN DELETE FROM public.facturacion_cola WHERE id=q2;
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Persistent exclusion deleted'; END IF;

  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  blocked:=false;
  BEGIN PERFORM public.admin_set_facturacion_exclusion(ARRAY[q1],false);
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Non-admin reinclusion allowed'; END IF;
  blocked:=false;
  BEGIN UPDATE public.facturacion_cola SET excluida_facturacion=false WHERE id=q1;
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Non-admin direct bypass allowed'; END IF;
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);

  IF public.admin_set_facturacion_exclusion(ARRAY[q1,q2],false) <> 2 THEN RAISE EXCEPTION 'Reinclusion failed'; END IF;
  IF (SELECT count(*) FROM public.facturacion_cola WHERE id IN(q1,q2) AND estado='pendiente' AND NOT excluida_facturacion AND reinclusion_por=admin_id AND reinclusion_at IS NOT NULL) <> 2 THEN RAISE EXCEPTION 'Reinclusion/audit fields incorrect'; END IF;
  IF public.admin_set_facturacion_exclusion(ARRAY[q1,q2],false) <> 0 THEN RAISE EXCEPTION 'Reinclusion replay not idempotent'; END IF;
  IF (SELECT count(*) FROM public.facturacion_cola_exclusion_log WHERE cola_id IN(q1,q2)) <> 4 THEN RAISE EXCEPTION 'Action history incomplete'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.facturacion_cola WHERE id=q1 AND monto=500 AND moneda='EUR' AND referencia_id=ref1) OR NOT EXISTS(SELECT 1 FROM public.facturacion_cola WHERE id=q2 AND monto=100 AND moneda='ARS' AND referencia_id=ref2) THEN RAISE EXCEPTION 'Economic data changed'; END IF;
  UPDATE public.facturas SET estado='emitiendo' WHERE id=f1;
  blocked:=false;
  BEGIN PERFORM public.admin_set_facturacion_exclusion(ARRAY[q1,q2],true);
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'In-flight exclusion allowed'; END IF;
  IF EXISTS(SELECT 1 FROM public.facturacion_cola WHERE id=q2 AND estado='excluida') THEN RAISE EXCEPTION 'Failed batch partially applied'; END IF;
  -- Synthetic fiscal transition only, no real number/CAE and no external calls.
  UPDATE public.facturas SET estado='emitida' WHERE id=f1;
  blocked:=false;
  BEGIN PERFORM public.admin_set_facturacion_exclusion(ARRAY[q1],true);
  EXCEPTION WHEN raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Issued invoice exclusion allowed'; END IF;
  IF original_rows IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.facturacion_cola c WHERE c.id NOT IN(q1,q2)) THEN RAISE EXCEPTION 'Existing queue rows changed'; END IF;
  RAISE NOTICE 'PASS: batch/single idempotency, persistent reprocessing, linked/legacy emission guards, RBAC, reinclusion, issued/in-flight blocks, unchanged economic data';
END;
$test$;
ROLLBACK;