-- Requires an authorized privileged test runner; restricted query access cannot execute this suite.
-- All changes are rolled back. Do not broaden application grants to run it.
BEGIN;
DO $$ DECLARE ev uuid:='67b4e85d-b00b-4b74-9644-99458d948c65'; rid uuid; tok text; other_tok text; ctx jsonb; command uuid; rev integer:=0; ch text; result jsonb; before_res text; after_res text;before_pay text;before_transfer text; BEGIN
 SELECT id,access_token INTO rid,tok FROM public.event_reservations WHERE event_id=ev AND reservation_status='reserva_confirmada' AND id NOT IN(SELECT original_reservation_id FROM public.reservation_transfers) ORDER BY id LIMIT 1;
 SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) INTO before_res FROM public.event_reservations r WHERE event_id=ev;
 SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text) INTO before_pay FROM public.reservation_payments p JOIN public.event_reservations r ON r.id=p.reservation_id WHERE r.event_id=ev;
 SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) INTO before_transfer FROM public.reservation_transfers t WHERE event_id=ev;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF public.get_rescheduling_context(ev,rid,tok)->>'available'<>'false' THEN RAISE EXCEPTION 'Public enabled unexpectedly'; END IF;
 BEGIN PERFORM public.submit_rescheduling_request(ev,rid,'{"choice":"help","consent":true}',0,gen_random_uuid(),tok);RAISE EXCEPTION 'Disabled public submission allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Reprogramación aún no habilitada' THEN RAISE; END IF;END;
 UPDATE public.event_rescheduling_campaigns SET public_enabled=true WHERE event_id=ev;
 ctx:=public.get_rescheduling_context(ev,rid,tok);
 IF jsonb_array_length(ctx->'reservations')<>1 THEN RAISE EXCEPTION 'Personal token failed';END IF;
 IF jsonb_array_length(public.get_rescheduling_context(ev,rid,'invalid-token-xxxxxxxxxxxxxxxx')->'reservations')<>0 THEN RAISE EXCEPTION 'Invalid token accepted';END IF;
 SELECT access_token INTO other_tok FROM public.event_reservations WHERE event_id=ev AND id<>rid AND access_token IS NOT NULL ORDER BY id LIMIT 1;
 IF other_tok IS NULL OR jsonb_array_length(public.get_rescheduling_context(ev,rid,other_tok)->'reservations')<>0 THEN RAISE EXCEPTION 'Cross-reservation token isolation failed';END IF;
 BEGIN PERFORM public.submit_rescheduling_request(ev,rid,'{"choice":"help","consent":true}',0,gen_random_uuid(),other_tok);RAISE EXCEPTION 'Other reservation token saved';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE;END IF;END;
 IF jsonb_array_length(ctx->'campaign'->'options')<>6 THEN RAISE EXCEPTION 'Expected six choices';END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"arbitrary@example.com","role":"authenticated"}',true);
 IF jsonb_array_length(public.get_rescheduling_context(ev,rid)->'reservations')<>0 THEN RAISE EXCEPTION 'Arbitrary identity exposed reservation';END IF;
 BEGIN PERFORM public.admin_rescheduling_report(ev); RAISE EXCEPTION 'Non-admin report allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claims','{}',true);
 command:=gen_random_uuid();
 result:=public.submit_rescheduling_request(ev,rid,'{"choice":"help","consent":true}',0,command,tok);
 IF result->>'origin'<>'personal_token' OR result->>'revision'<>'1' THEN RAISE EXCEPTION 'Token provenance absent';END IF;
 result:=public.submit_rescheduling_request(ev,rid,'{"choice":"help","consent":true}',0,command,tok);
 IF (SELECT count(*) FROM public.reservation_rescheduling_history WHERE reservation_id=rid)<>1 THEN RAISE EXCEPTION 'Retry duplicated history';END IF;
 BEGIN PERFORM public.submit_rescheduling_request(ev,rid,'{"choice":"refund","consent":true}',0,gen_random_uuid(),tok);RAISE EXCEPTION 'Stale revision accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Otra respuesta fue guardada%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.submit_rescheduling_request(ev,rid,'{"choice":"refund","consent":false}',1,gen_random_uuid(),tok);RAISE EXCEPTION 'Missing consent accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Elegí una opción y confirmá el consentimiento' THEN RAISE;END IF;END;
 BEGIN PERFORM public.submit_rescheduling_request(ev,rid,'{"choice":"refund","consent":true,"jersey_requested":true,"jersey_consent":false,"jersey_size":"M","delivery":"retiro"}',1,gen_random_uuid(),tok);RAISE EXCEPTION 'Jersey without consent accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Confirmá talle, entrega y consentimiento del jersey' THEN RAISE;END IF;END;
 FOREACH ch IN ARRAY ARRAY['attend_5_8','attend_6_9','attend_5_9','refund','credit','help'] LOOP
 SELECT revision INTO rev FROM public.reservation_rescheduling_requests WHERE reservation_id=rid;
 result:=public.submit_rescheduling_request(ev,rid,jsonb_build_object('choice',ch,'consent',true,'jersey_requested',false),rev,gen_random_uuid(),tok);
 IF result->>'choice'<>ch OR result->>'origin'<>'personal_token' THEN RAISE EXCEPTION 'Personal-token choice save failed';END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"sub":"0d70cac6-b7ff-4041-a90e-d40614f39622","role":"authenticated"}',true);
 UPDATE public.event_rescheduling_campaigns SET public_enabled=false WHERE event_id=ev;
 FOREACH ch IN ARRAY ARRAY['attend_5_8','attend_6_9','attend_5_9','refund','credit','help'] LOOP
 SELECT revision INTO rev FROM public.reservation_rescheduling_requests WHERE reservation_id=rid;
 result:=public.submit_rescheduling_request(ev,rid,jsonb_build_object('choice',ch,'consent',true,'source','QA reversible','note','Decisión de prueba sin ejecución'),rev,gen_random_uuid());
 IF result->>'choice'<>ch OR result->>'review_status'<>'pendiente' THEN RAISE EXCEPTION 'Choice save failed';END IF;
 END LOOP;
 SELECT revision INTO rev FROM public.reservation_rescheduling_requests WHERE reservation_id=rid;
 command:=gen_random_uuid();PERFORM public.admin_review_rescheduling(rid,rev,'validada','QA sin ejecución',command);PERFORM public.admin_review_rescheduling(rid,rev,'validada','QA sin ejecución',command);
 IF (SELECT review_status FROM public.reservation_rescheduling_requests WHERE reservation_id=rid)<>'validada' THEN RAISE EXCEPTION 'Admin review failed';END IF;
 IF (SELECT actor_id FROM public.reservation_rescheduling_history WHERE command_id=command) IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Missing admin audit actor';END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) FROM public.event_reservations r WHERE event_id=ev)<>before_res THEN RAISE EXCEPTION 'Reservation mutated';END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text) FROM public.reservation_payments p JOIN public.event_reservations r ON r.id=p.reservation_id WHERE r.event_id=ev)<>before_pay THEN RAISE EXCEPTION 'Payments mutated';END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.reservation_transfers t WHERE event_id=ev)<>before_transfer THEN RAISE EXCEPTION 'Transfer mutated';END IF;
 BEGIN INSERT INTO public.training_camp_credit_accounts(source_reservation_id,beneficiary_alumno_id) VALUES(rid,gen_random_uuid());RAISE EXCEPTION 'Credit emission allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Operaciones financieras bloqueadas%' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.training_camp_credit_ledger) THEN RAISE EXCEPTION 'Unexpected spendable ledger';END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.reservation_rescheduling_requests;RAISE EXCEPTION 'Anonymous table read allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public._rescheduling_financial('00000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'Anonymous private helper allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.reservation_rescheduling_requests) THEN RAISE EXCEPTION 'Nonadmin RLS read allowed';END IF;
 BEGIN UPDATE public.event_rescheduling_campaigns SET public_enabled=true; RAISE EXCEPTION 'Client enabled public';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.reservation_rescheduling_history WHERE revision=1;RAISE EXCEPTION 'Audit deletion allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
