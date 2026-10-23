-- Run only against tests/sql/reconciliation_legacy_local_setup.sql on isolated PostgreSQL.
BEGIN;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
CREATE TRIGGER trg_guard_pagos_imputaciones BEFORE INSERT OR UPDATE ON public.pagos_imputaciones FOR EACH ROW EXECUTE FUNCTION public.guard_pagos_imputaciones();
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); account uuid:=gen_random_uuid(); plan uuid:=gen_random_uuid();
 july uuid:=gen_random_uuid(); august uuid:=gen_random_uuid(); debt uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); partial uuid:=gen_random_uuid();
 credit uuid:=gen_random_uuid(); pi uuid; before_total numeric; after_total numeric; rejected boolean:=false;
BEGIN
 INSERT INTO public.planes(id,nombre,moneda,precio) VALUES(plan,'QA','ARS',80030);
 INSERT INTO public.suscripciones(id,alumno_id,plan_id,precio_base,precio_final,estado,fecha_inicio,metodo_pago,origen_registro)
 VALUES(july,a,plan,75500,75500,'finalizada','2026-07-01','efectivo','admin'),
 (august,a,plan,83500,83500,'finalizada','2026-08-01','mp_externo_claudio','cargado_admin'),
 (debt,a,plan,1000,1000,'pendiente','2026-09-01','pendiente','admin');
 INSERT INTO public.mp_account_movements(id,cuenta_mp_id,mp_payment_id,alumno_id,amount,currency,direccion,status,fecha_movimiento)
 VALUES(m,account,'qa:july',a,80030,'ARS','ingreso','approved',now()),(partial,account,'qa:partial',a,1000,'ARS','ingreso','approved',now());
 INSERT INTO public.cuenta_ajustes(id,alumno_id,tipo,monto,moneda,referencia_externa,cuenta_mp_id,concepto)
 VALUES(credit,a,'credito',80030,'ARS','qa:july',account,'QA'),(gen_random_uuid(),b,'credito',600,'ARS','qa:partial',account,'Family QA');
 IF public.pago_saldo_disponible('mp_movement',m)<>0 THEN RAISE EXCEPTION 'FAIL represented 80030 available twice'; END IF;
 IF public.pago_saldo_disponible('mp_movement',partial)<>400 THEN RAISE EXCEPTION 'FAIL legitimate family remanent'; END IF;
 IF public.obligacion_saldo_pendiente('suscripcion',august)<>0 THEN RAISE EXCEPTION 'FAIL legacy manual paid obligation'; END IF;
 IF public.obligacion_saldo_pendiente('suscripcion',july)<>75500 THEN RAISE EXCEPTION 'FAIL unpaid July'; END IF;
 BEGIN PERFORM public.imputar_pago('mp_movement',m,'suscripcion',july,a,75500,'ARS','{}'); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='payment_already_represented_or_overallocated'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL duplicate blocked'; END IF;
 pi:=public.imputar_pago('mp_movement',partial,'suscripcion',debt,a,400,'ARS','{}');
 IF public.imputar_pago('mp_movement',partial,'subscription',debt,a,400,'ARS','{}')<>pi THEN RAISE EXCEPTION 'FAIL retry idempotency'; END IF;
 IF public.pago_saldo_disponible('mp_movement',partial)<>0 THEN RAISE EXCEPTION 'FAIL partial exhausted'; END IF;
 IF public.obligacion_saldo_pendiente('suscripcion',debt)<>600 THEN RAISE EXCEPTION 'FAIL partial obligation'; END IF;
 SELECT sum(haber) INTO before_total FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id IN(a,b);
 IF before_total<>164530 THEN RAISE EXCEPTION 'FAIL double credit/imputation or hidden remanent %',before_total; END IF;
 UPDATE public.suscripciones SET precio_base=80030,precio_final=80030 WHERE id=july;
 UPDATE public.mp_account_movements SET suscripcion_id=july WHERE id=m;
 UPDATE public.cuenta_ajustes SET aplicado_a_fuente_tabla='suscripciones',aplicado_a_fuente_id=july WHERE id=credit;
 SELECT sum(haber) INTO after_total FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id IN(a,b);
 IF after_total<>before_total OR NOT public.is_subscription_paid(july) OR public.obligacion_saldo_pendiente('suscripcion',july)<>0 THEN RAISE EXCEPTION 'FAIL July reconciliation'; END IF;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true); rejected:=false;
 BEGIN PERFORM public.imputar_pago('mp_movement',partial,'suscripcion',debt,a,400,'ARS','{}'); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='not_authorized'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL unauthorized idempotent read'; END IF;
 RAISE NOTICE 'PASS: Natalia-equivalent, manual paid, partial/family remainder, single credit, idempotency, authorization';
END $$;
ROLLBACK;
