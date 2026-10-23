-- Targeted data repair authorized by Scarlett, 2026-10-23. Execute through the data-change tool, never as a migration.
-- One atomic DO statement. Any precondition/postcondition failure rolls back the backup and every update.
DO $repair$
DECLARE
 a constant uuid:='2f0a26ff-0e42-483d-8f38-eab211fb63d0';
 j constant uuid:='eb9feece-3834-4530-9873-8e0c5334e00b';
 aug constant uuid:='6041d11d-a967-4db5-814d-3d29257e3927';
 jm constant uuid:='f121ab14-78fe-4860-9dbd-04766fa97676';
 am constant uuid:='7621a44c-dfa8-4753-93fc-a8dac3f0638f';
 cr constant uuid:='d802d2a0-c623-44c6-98cf-b356e78e5fd2';
 js public.suscripciones; aus public.suscripciones; m1 public.mp_account_movements; m2 public.mp_account_movements; c public.cuenta_ajustes;
 backup jsonb; untouched jsonb; post_untouched jsonb; totals jsonb; audit_id uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('authorized-repair:natalia:2026-10-23',0));
 IF EXISTS(SELECT 1 FROM public.audit_log WHERE action='natalia_reconciliation_20261023' AND entity_id=a::text) THEN RAISE EXCEPTION 'Repair already executed; verify rather than repeat'; END IF;
 -- Stable ordering prevents competing allocation while the source/destination rows are inspected.
 PERFORM 1 FROM public.mp_account_movements WHERE id IN(jm,am) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.suscripciones WHERE alumno_id=a ORDER BY id FOR UPDATE;
 SELECT * INTO js FROM public.suscripciones WHERE id=j;
 SELECT * INTO aus FROM public.suscripciones WHERE id=aug;
 SELECT * INTO m1 FROM public.mp_account_movements WHERE id=jm;
 SELECT * INTO m2 FROM public.mp_account_movements WHERE id=am;
 SELECT * INTO c FROM public.cuenta_ajustes WHERE id=cr FOR UPDATE;
 IF js.id IS NULL OR aus.id IS NULL OR m1.id IS NULL OR m2.id IS NULL OR c.id IS NULL THEN RAISE EXCEPTION 'Missing audited record'; END IF;
 IF js.alumno_id<>a OR js.fecha_inicio<>'2026-07-01' OR js.fecha_fin<>'2026-07-31' OR js.precio_base<>75500 OR js.precio_final<>75500 OR js.cancelada_at IS NOT NULL OR js.descuento_id IS NOT NULL OR js.precio_excepcion_motivo IS NOT NULL OR public.is_subscription_paid(j) THEN RAISE EXCEPTION 'July evidence changed'; END IF;
 IF aus.alumno_id<>a OR aus.fecha_inicio<>'2026-08-01' OR aus.precio_final<>83500 OR aus.metodo_pago<>'mp_externo_claudio' OR aus.origen_registro<>'cargado_admin' OR aus.cancelada_at IS NOT NULL OR NOT public.is_subscription_paid(aug) THEN RAISE EXCEPTION 'August evidence changed'; END IF;
 IF m1.mp_payment_id<>'171057647747' OR m1.amount<>80030 OR m1.currency<>'ARS' OR m1.status<>'approved' OR m1.direccion<>'ingreso' OR m1.alumno_id IS DISTINCT FROM a OR m1.suscripcion_id IS NOT NULL OR m1.reservation_payment_id IS NOT NULL THEN RAISE EXCEPTION 'July payment changed'; END IF;
 IF m2.mp_payment_id<>'174203315428' OR m2.amount<>83500 OR m2.currency<>'ARS' OR m2.status<>'approved' OR m2.direccion<>'ingreso' OR m2.alumno_id IS NOT NULL OR m2.suscripcion_id IS NOT NULL OR m2.reservation_payment_id IS NOT NULL OR m2.payer_document<>'27248214983' OR lower(trim(m2.payer_email))<>'nataliabasilico1975@gmail.com' OR m2.payer_document IS DISTINCT FROM m1.payer_document OR m2.payer_email IS DISTINCT FROM m1.payer_email THEN RAISE EXCEPTION 'August payment identity changed'; END IF;
 IF c.alumno_id<>a OR c.tipo<>'credito' OR c.monto<>80030 OR c.moneda<>'ARS' OR c.referencia_externa<>m1.mp_payment_id OR c.cuenta_mp_id IS DISTINCT FROM m1.cuenta_mp_id OR c.aplicado_a_fuente_id IS NOT NULL OR c.aplicado_a_fuente_tabla IS NOT NULL THEN RAISE EXCEPTION 'July credit evidence changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.pagos_imputaciones WHERE pago_origen_tipo='mp_movement' AND pago_origen_id IN(jm,am) AND anulado_at IS NULL) THEN RAISE EXCEPTION 'Payment already allocated'; END IF;
 IF EXISTS(SELECT 1 FROM public.suscripciones WHERE id NOT IN(j,aug) AND mp_payment_id IN(m1.mp_payment_id,m2.mp_payment_id)) THEN RAISE EXCEPTION 'Payment associated with another period'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.precio_historial WHERE plan_id=js.plan_id AND precio_anterior=75500 AND precio_nuevo=80030 AND fecha_cambio::date='2026-05-29') THEN RAISE EXCEPTION 'Missing price evidence'; END IF;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY moneda) INTO totals FROM (SELECT moneda,sum(debe) cargos,sum(haber) pagos,sum(debe-haber) saldo FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a GROUP BY moneda)t;
 IF NOT EXISTS(SELECT 1 FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a AND moneda='EUR' GROUP BY moneda HAVING sum(debe)=2478.61 AND sum(haber)=500) THEN RAISE EXCEPTION 'EUR baseline changed'; END IF;
 SELECT jsonb_build_object('subs',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.suscripciones s WHERE alumno_id=a AND id NOT IN(j,aug)), 'reservations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.event_reservations r WHERE alumno_id=a),'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.reservation_payments p WHERE alumno_id=a)) INTO untouched;
 backup:=jsonb_build_object('authorization','Scarlett: Dale avanza; explicit targeted reconciliation request 2026-10-23','execution_identity','privileged data tool; auth.uid is NULL, not impersonated','before',jsonb_build_object('july',to_jsonb(js),'august',to_jsonb(aus),'july_mp',to_jsonb(m1)-'raw','august_mp',to_jsonb(m2)-'raw','credit',to_jsonb(c),'totals',totals),'price_evidence','May 29: 75500 to 80030; canceled original July subscription 80030','scope','Only July price/notes, two MP links, existing July credit link; no billing/payment-state trigger columns updated');
 INSERT INTO public.audit_log(id,user_id,user_role,action,entity_type,entity_id,details) VALUES(audit_id,NULL,'system','natalia_reconciliation_20261023','alumnos',a::text,backup);
 UPDATE public.suscripciones SET precio_base=80030,precio_final=80030,
 notas=COALESCE(notas,'')||E'\nConciliación autorizada Scarlett 23/10/2026: julio corregido 75500 → 80030 según precio vigente 29/05; pago MP 171057647747 vinculado; crédito d802d2a0 conservado y aplicado. Auditoría '||audit_id::text WHERE id=j;
 -- Do not change mp_status/mp_payment_id/estado/pago_confirmado_at: avoids triggering invoice queue or payment notifications.
 UPDATE public.mp_account_movements SET alumno_id=a,suscripcion_id=CASE id WHEN jm THEN j ELSE aug END,
 assigned_manually=true,assign_notes=COALESCE(assign_notes,'')||E'\nConciliación autorizada Scarlett 23/10/2026; respaldo auditoría '||audit_id::text WHERE id IN(jm,am);
 UPDATE public.cuenta_ajustes SET aplicado_a_fuente_tabla='suscripciones',aplicado_a_fuente_id=j,
 notas=COALESCE(notas,'')||E'\nRepresentación conservada y vinculada a julio; no nuevo ingreso. Auditoría '||audit_id::text WHERE id=cr;
 IF NOT public.is_subscription_paid(j) OR NOT public.is_subscription_paid(aug) OR public.obligacion_saldo_pendiente('suscripcion',j)<>0 OR public.obligacion_saldo_pendiente('suscripcion',aug)<>0 OR public.pago_saldo_disponible('mp_movement',jm)<>0 OR public.pago_saldo_disponible('mp_movement',am)<>0 THEN RAISE EXCEPTION 'Payment reconciliation postcondition failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a AND moneda='ARS' GROUP BY moneda HAVING sum(debe)=577910 AND sum(haber)=577910 AND sum(debe-haber)=0) THEN RAISE EXCEPTION 'ARS total postcondition failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id=a AND moneda='EUR' GROUP BY moneda HAVING sum(debe)=2478.61 AND sum(haber)=500 AND sum(debe-haber)=1978.61) THEN RAISE EXCEPTION 'EUR total postcondition failed'; END IF;
 SELECT jsonb_build_object('subs',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.suscripciones s WHERE alumno_id=a AND id NOT IN(j,aug)), 'reservations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.event_reservations r WHERE alumno_id=a),'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.reservation_payments p WHERE alumno_id=a)) INTO post_untouched;
 IF untouched IS DISTINCT FROM post_untouched OR to_jsonb(aus) IS DISTINCT FROM (SELECT to_jsonb(s) FROM public.suscripciones s WHERE id=aug) THEN RAISE EXCEPTION 'Unrelated history changed'; END IF;
 UPDATE public.audit_log SET details=backup||jsonb_build_object('after',jsonb_build_object('july',(SELECT to_jsonb(s) FROM public.suscripciones s WHERE id=j),'august',(SELECT to_jsonb(s) FROM public.suscripciones s WHERE id=aug),'july_mp',(SELECT to_jsonb(m)-'raw' FROM public.mp_account_movements m WHERE id=jm),'august_mp',(SELECT to_jsonb(m)-'raw' FROM public.mp_account_movements m WHERE id=am),'credit',(SELECT to_jsonb(ca) FROM public.cuenta_ajustes ca WHERE id=cr),'ARS',jsonb_build_object('cargos',577910,'pagos',577910,'saldo',0),'EUR',jsonb_build_object('cargos',2478.61,'pagos',500,'saldo',1978.61)),'untouched_history_verified',true) WHERE id=audit_id;
END $repair$;
