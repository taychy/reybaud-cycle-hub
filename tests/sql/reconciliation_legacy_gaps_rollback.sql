-- Real statement view and real assignment/application RPCs; isolated fixtures only.
BEGIN;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
CREATE TRIGGER trg_guard_pagos_imputaciones BEFORE INSERT OR UPDATE ON public.pagos_imputaciones FOR EACH ROW EXECUTE FUNCTION public.guard_pagos_imputaciones();
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 account uuid:=gen_random_uuid(); plan uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 m uuid:=gen_random_uuid(); cm uuid:=gen_random_uuid(); cs uuid:=gen_random_uuid(); credit uuid:=gen_random_uuid();
 family uuid:=gen_random_uuid(); fs uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 owners uuid[]; amounts numeric[]:=ARRAY[49868,54000,71240,71240]; i int; err text; total numeric;
BEGIN
 INSERT INTO public.planes(id,nombre,moneda,precio) VALUES(plan,'Isolated gap QA','ARS',800);
 INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
 VALUES(s,a,plan,800,'pendiente','pendiente','admin'),(d,a,plan,600,'pendiente','pendiente','admin'),(cs,a,plan,800,'pendiente','pendiente','admin');
 INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status,fecha_movimiento)
 VALUES(m,account,'qa:gap-excess',a,1000,'ARS','ingreso','approved',now()),(cm,account,'qa:gap-credit',a,800,'ARS','ingreso','approved',now());
 PERFORM public.assign_mp_movement_to_target(m,a,'suscripcion',s);
 SELECT sum(haber) INTO total FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
 IF total IS DISTINCT FROM 1000 OR public.obligacion_saldo_pendiente('suscripcion',s)<>0 OR public.pago_saldo_disponible('mp_movement',m)<>200 THEN
 RAISE EXCEPTION 'FAIL pre-application: haber %, expected 1000; subscription 0; available 200',total; END IF;
 PERFORM public.aplicar_saldo_disponible('mp_movement',m,'suscripcion',d,200);
 SELECT sum(haber) INTO total FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a;
 IF total IS DISTINCT FROM 1000 OR public.obligacion_saldo_pendiente('suscripcion',s)<>0 OR public.obligacion_saldo_pendiente('suscripcion',d)<>400
 OR public.pago_saldo_disponible('mp_movement',m)<>0 THEN RAISE EXCEPTION 'FAIL post-application: haber %, expected 1000; original 0; other 400; available 0',total; END IF;
 RAISE NOTICE 'PASS real view: MP1000/sub800/remainder200, haber1000 before and after, other600->400';
 INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id,concepto)
 VALUES(credit,a,'credito',800,'ARS','qa:gap-credit',account,'Existing income');
 BEGIN PERFORM public.assign_mp_movement_to_target(cm,a,'suscripcion',cs); EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS NULL OR strpos(err,'movement_has_existing_credit')=0 THEN RAISE EXCEPTION 'FAIL direct assignment bypass: %',err; END IF;
 IF EXISTS(SELECT 1 FROM public.mp_account_movements WHERE id=cm AND suscripcion_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.suscripciones WHERE id=cs AND mp_status='approved') THEN RAISE EXCEPTION 'FAIL blocked RPC changed target'; END IF;
 err:=NULL;
 BEGIN UPDATE public.mp_account_movements SET suscripcion_id=cs WHERE id=cm; EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS NULL OR strpos(err,'movement_has_existing_credit')=0 THEN RAISE EXCEPTION 'FAIL direct update bypass'; END IF;
 PERFORM public.apply_credit_ajuste_to_suscripcion(credit,cs);
 IF NOT EXISTS(SELECT 1 FROM public.cuenta_ajustes WHERE id=credit AND aplicado_a_fuente_id=cs)
 OR NOT EXISTS(SELECT 1 FROM public.mp_account_movements WHERE id=cm AND suscripcion_id=cs)
 OR public.obligacion_saldo_pendiente('suscripcion',cs)<>0 THEN RAISE EXCEPTION 'FAIL existing credit application broken'; END IF;
 err:=NULL;
 BEGIN INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id)
 VALUES(gen_random_uuid(),b,'credito',1,'ARS','qa:gap-excess',account); EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF err IS NULL OR strpos(err,'mp_income_already_linked_to_subscription')=0 THEN RAISE EXCEPTION 'FAIL new credit after MP link'; END IF;
 RAISE NOTICE 'PASS direct RPC/update blocked; original apply_credit_ajuste_to_suscripcion preserved; new credit blocked';
 -- Original run_imputaciones_regression_tests test7, same four amounts and three owners, no real students.
 owners:=ARRAY[b,c,c,a];
 INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status)
 VALUES(family,account,'qa:gap-family',a,246348,'ARS','ingreso','approved');
 FOR i IN 1..4 LOOP
 INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_final,estado,metodo_pago,origen_registro)
 VALUES(fs[i],owners[i],plan,amounts[i],'pendiente','pendiente','admin');
 PERFORM public.imputar_pago('mp_movement',family,'suscripcion',fs[i],owners[i],amounts[i],'ARS');
 IF public.obligacion_saldo_pendiente('suscripcion',fs[i])<>0 THEN RAISE EXCEPTION 'FAIL family obligation %',i; END IF;
 END LOOP;
 SELECT sum(haber) INTO total FROM public.vw_cuenta_corriente_movimientos WHERE fuente_tabla='pagos_imputaciones' AND referencia_extra->>'pago_origen_id'=family::text;
 IF total IS DISTINCT FROM 246348 OR public.pago_saldo_disponible('mp_movement',family)<>0
 OR (SELECT count(*) FROM public.pagos_imputaciones WHERE pago_origen_id=family)<>4
 OR EXISTS(SELECT 1 FROM public.suscripciones WHERE mp_payment_id='qa:gap-family') THEN RAISE EXCEPTION 'FAIL original test7 family split'; END IF;
 RAISE NOTICE 'PASS original test7 isolated: 49868+54000+71240+71240=246348, four splits, one income';
END $$;
ROLLBACK;