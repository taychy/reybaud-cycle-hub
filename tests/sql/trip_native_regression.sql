SELECT set_config('test.actor','00000000-0000-4000-8000-000000000001',false);
DO $$ DECLARE req uuid; out jsonb; rid uuid; token text; BEGIN
 req:=public.qa_native_request(101,'00000000-0000-4000-8000-000000000030',2);
 PERFORM public.admin_hold_trip_request_capacity(req,false,'hotel confirmado para ambas personas');
 ASSERT public.admin_trip_native_preflight(req)->>'can_prepare'='false';
 BEGIN PERFORM public.admin_prepare_trip_native_reservations(req,public.qa_emails(101,2),'identidades validadas'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Preparación bloqueada:%'; END;
 ASSERT NOT EXISTS(SELECT 1 FROM public.event_reservations);
 ASSERT (SELECT count(*) FROM public.event_package_payment_plans WHERE activo)=0;
END $$;
-- Explicit approval and preparation flag are enabled ONLY in this disposable database, never Cloud.
UPDATE public.trip_capacity_pools SET native_preparation_enabled=true;
UPDATE public.events SET metadata=jsonb_build_object('terms_validation',jsonb_build_object('status','validated','version','QA-1'),'terminos_version','QA-1','politica_sena','Seña 30% antes de confirmar.','politica_cancelacion','Texto exclusivamente de prueba aislada.','politica_pagos','30/35/35; 15/12/2026 y 10/01/2027.','reglamento_texto','Reglamento exclusivamente de prueba aislada.');
DO $$ DECLARE req uuid:=md5('101')::uuid; out jsonb; rid uuid; token text; before_remaining integer; BEGIN
 before_remaining:=(public.get_trip_request_capacity('5380df24-6bbf-4d25-81cd-a1ab2b41bd94','00000000-0000-4000-8000-000000000040')->>'remaining')::int;
 ASSERT before_remaining=7;
 out:=public.admin_prepare_trip_native_reservations(req,public.qa_emails(101,2),'identidades y contrato validados');
 ASSERT out->>'payment_enabled'='false'; ASSERT out->>'terms_pending'='true';
 ASSERT (SELECT count(*) FROM public.event_reservations)=2;
 ASSERT (SELECT count(*) FROM public.reservation_installments)=6;
 ASSERT (SELECT sum(amount) FROM public.reservation_installments)=3900000;
 ASSERT (SELECT count(*) FROM public.reservation_installments WHERE installment_type='sena' AND amount=585000)=2;
 ASSERT (SELECT count(*) FROM public.reservation_installments WHERE due_date='2026-12-15' AND amount=682500)=2;
 ASSERT (SELECT count(*) FROM public.reservation_installments WHERE due_date='2027-01-10' AND amount=682500)=2;
 ASSERT (public.get_trip_request_capacity('5380df24-6bbf-4d25-81cd-a1ab2b41bd94','00000000-0000-4000-8000-000000000040')->>'remaining')::int=before_remaining;
 ASSERT public.admin_prepare_trip_native_reservations(req,public.qa_emails(101,2),'doble clic')->>'duplicate'='true';
 ASSERT (SELECT count(*) FROM public.event_reservations)=2;
 SELECT id,terminos_token INTO rid,token FROM public.event_reservations LIMIT 1;
 ASSERT (SELECT terminos_pendientes AND NOT accepted_terms AND amount_paid=0 AND confirmed_at IS NULL FROM public.event_reservations WHERE id=rid);
 BEGIN UPDATE public.event_reservations SET accepted_terms=true,terminos_pendientes=false WHERE id=rid; RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Solo el participante%'; END;
 BEGIN INSERT INTO public.reservation_payments(reservation_id,amount,currency,status) VALUES(rid,585000,'ARS','validado'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Cobro bloqueado:%'; END;
 BEGIN UPDATE public.event_reservations SET reservation_status='reserva_confirmada',confirmed_at=now() WHERE id=rid; RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Confirmación bloqueada%'; END;
 BEGIN PERFORM public.admin_hold_trip_request_capacity(req,true,'liberar convertido'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Retención convertida:%'; END;
 BEGIN INSERT INTO public.event_reservations(id,event_id) VALUES(gen_random_uuid(),'408a8eb8-fb62-4a50-ad6d-040bd5716797'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Reserva y cobro bloqueados:%'; END;
END $$;
-- Real public native acceptance function, scoped by one-time token. No writes to Cloud.
SELECT set_config('test.native_token',(SELECT terminos_token FROM public.event_reservations LIMIT 1),false) IS NOT NULL AS token_ready;
SET ROLE anon;
SELECT set_config('test.actor','',false);
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.event_reservations)=0;
 ASSERT public.get_reservation_terms_by_token('invalid')->>'status'='invalido';
 ASSERT NOT has_function_privilege('anon','public.admin_prepare_trip_native_reservations(uuid,text[],text)','EXECUTE');
 ASSERT NOT has_table_privilege('anon','public.trip_capacity_reservation_links','SELECT');
 ASSERT NOT has_function_privilege('anon','public._accept_reservation_terms(uuid,text,text)','EXECUTE');
 ASSERT public.accept_reservation_terms_by_token(current_setting('test.native_token'),'QA-1')->>'version'='QA-1';
END $$;
RESET ROLE;
DO $$ DECLARE t text; rid uuid; BEGIN
 SELECT id,terminos_token INTO rid,t FROM public.event_reservations WHERE terminos_token IS NOT NULL LIMIT 1;
 PERFORM set_config('test.actor','',false);
 PERFORM public.accept_reservation_terms_by_token(t,'QA-1');
 ASSERT (SELECT accepted_terms AND NOT terminos_pendientes AND terminos_aceptados_at IS NOT NULL AND terminos_snapshot->>'canal'='enlace' FROM public.event_reservations WHERE id=rid);
 ASSERT public.get_reservation_terms_by_token(t)->>'status'='invalido';
 ASSERT NOT EXISTS(SELECT 1 FROM public.reservation_payments);
 PERFORM set_config('test.actor','00000000-0000-4000-8000-000000000001',false);
 UPDATE public.event_reservations SET reservation_status='cancelada',cancelled_at=now() WHERE id=rid;
 ASSERT (public.get_trip_request_capacity('5380df24-6bbf-4d25-81cd-a1ab2b41bd94','00000000-0000-4000-8000-000000000040')->>'remaining')::int=8;
 BEGIN UPDATE public.event_reservations SET reservation_status='solicitud_enviada',cancelled_at=NULL WHERE id=rid; RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'No se puede reactivar%'; END;
END $$;
-- Group rollback: second identity is absent; first reservation, link and installments must all disappear.
DO $$ DECLARE req uuid; n integer; BEGIN
 req:=public.qa_native_request(102,'00000000-0000-4000-8000-000000000020',2);
 PERFORM public.admin_hold_trip_request_capacity(req,false,'hotel confirmado');
 n:=(SELECT count(*) FROM public.event_reservations);
 BEGIN PERFORM public.admin_prepare_trip_native_reservations(req,ARRAY['persona102-1@example.invalid','missing@example.invalid'],'grupo validado'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Revisá la ficha individual%'; END;
 ASSERT (SELECT count(*) FROM public.event_reservations)=n;
 ASSERT NOT EXISTS(SELECT 1 FROM public.trip_capacity_reservation_links WHERE request_id=req);
 ASSERT (SELECT released_at IS NULL FROM public.trip_capacity_holds WHERE request_id=req);
 BEGIN PERFORM public.admin_prepare_trip_native_reservations(req,ARRAY['persona102-1@example.invalid','persona102-1@example.invalid'],'grupo validado'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Cada participante%'; END;
 PERFORM public.admin_prepare_trip_native_reservations(req,public.qa_emails(102,2),'grupo validado');
 ASSERT (SELECT count(*) FROM public.trip_capacity_reservation_links WHERE request_id=req)=2;
END $$;
-- A second request cannot book the same identified participant across overlapping camps.
DO $$ DECLARE req uuid; n integer; BEGIN
 req:=public.qa_native_request(103,'00000000-0000-4000-8000-000000000010',1);
 UPDATE public.event_enrollment_requests SET attendees='[{"firstName":"Persona102","lastName":"QA1"}]' WHERE id=req;
 PERFORM public.admin_hold_trip_request_capacity(req,false,'hotel confirmado');
 n:=(SELECT count(*) FROM public.event_reservations);
 BEGIN PERFORM public.admin_prepare_trip_native_reservations(req,ARRAY['persona102-1@example.invalid'],'identidad validada'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Esta persona ya tiene%'; END;
 ASSERT (SELECT count(*) FROM public.event_reservations)=n;
 ASSERT NOT EXISTS(SELECT 1 FROM public.trip_capacity_reservation_links WHERE request_id=req);
END $$;
-- Failure inside materialization rolls back every participant/link/installment of the group.
CREATE FUNCTION public.qa_fail_installment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA fallo materialización'; END $$;
DO $$ DECLARE req uuid; n integer; BEGIN
 req:=public.qa_native_request(104,'00000000-0000-4000-8000-000000000050',2);
 PERFORM public.admin_hold_trip_request_capacity(req,false,'hotel confirmado');
 n:=(SELECT count(*) FROM public.event_reservations);
 EXECUTE 'CREATE TRIGGER qa_fail_installment BEFORE INSERT ON public.reservation_installments FOR EACH ROW EXECUTE FUNCTION public.qa_fail_installment()';
 BEGIN PERFORM public.admin_prepare_trip_native_reservations(req,public.qa_emails(104,2),'grupo validado'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='QA fallo materialización'; END;
 ASSERT (SELECT count(*) FROM public.event_reservations)=n;
 ASSERT NOT EXISTS(SELECT 1 FROM public.trip_capacity_reservation_links WHERE request_id=req);
 ASSERT NOT EXISTS(SELECT 1 FROM public.reservation_payments);
 EXECUTE 'DROP TRIGGER qa_fail_installment ON public.reservation_installments';
END $$;
-- True native builder: exact reference values including due-today and overdue behavior.
DO $$ DECLARE plan uuid; snap jsonb; due numeric; d date; expected numeric; BEGIN
 SELECT native_payment_plan_id INTO plan FROM public.trip_capacity_packages WHERE package_id='00000000-0000-4000-8000-000000000030';
 FOR d,expected IN SELECT * FROM (VALUES('2026-11-28'::date,585000),('2026-12-15'::date,1267500),('2026-12-16'::date,1267500),('2027-01-10'::date,1950000),('2027-01-11'::date,1950000)) x LOOP
 snap:=public.build_payment_plan_snapshot(plan,1950000,d);
 SELECT sum((e->>'monto')::numeric) INTO due FROM jsonb_array_elements(snap->'calculated'->'installments') e WHERE (e->>'due_date')::date<=d;
 ASSERT due=expected,format('due %s on %s <> %s',due,d,expected);
 ASSERT (SELECT sum((e->>'monto')::numeric) FROM jsonb_array_elements(snap->'calculated'->'installments') e)=1950000;
 END LOOP;
END $$;
SELECT 'PASS: native groups, no double counting, idempotency, native terms, payments blocked, RLS, cancellation, rollback, 30/35/35 late installments' AS result;
