-- Execute through the authorized Cloud data tool, never a restricted query runner.
-- No public activation and no lasting decisions. Transaction always rolls back.
BEGIN;
DO $$ DECLARE ev uuid:='67b4e85d-b00b-4b74-9644-99458d948c65';rid uuid;rev integer:=0;cmd uuid;ch text;result jsonb;before_res text; BEGIN
SELECT id INTO rid FROM public.event_reservations WHERE event_id=ev AND reservation_status='reserva_confirmada' ORDER BY id LIMIT 1;
SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) INTO before_res FROM public.event_reservations r WHERE event_id=ev;
PERFORM set_config('request.jwt.claims','{}',true);
IF public.get_rescheduling_context(ev,rid)->>'available'<>'false' THEN RAISE EXCEPTION 'Public not disabled';END IF;
BEGIN PERFORM public.submit_rescheduling_request(ev,rid,'{"choice":"help","consent":true}',0,gen_random_uuid());RAISE EXCEPTION 'Disabled submission allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Reprogramación aún no habilitada' THEN RAISE;END IF;END;
PERFORM set_config('request.jwt.claims','{"sub":"0d70cac6-b7ff-4041-a90e-d40614f39622","role":"authenticated"}',true);
FOREACH ch IN ARRAY ARRAY['attend_5_8','attend_6_9','attend_5_9','refund','credit','help'] LOOP
cmd:=gen_random_uuid();result:=public.submit_rescheduling_request(ev,rid,jsonb_build_object('choice',ch,'consent',true,'source','QA reversible','note','QA sin ejecución'),rev,cmd);
IF result->>'choice'<>ch OR (result->>'revision')::integer<>rev+1 THEN RAISE EXCEPTION 'Save failed';END IF;
PERFORM public.submit_rescheduling_request(ev,rid,jsonb_build_object('choice',ch,'consent',true,'source','QA reversible','note','QA sin ejecución'),rev,cmd);
rev:=rev+1;
IF (SELECT count(*) FROM public.reservation_rescheduling_history WHERE reservation_id=rid)<>rev THEN RAISE EXCEPTION 'Duplicate history';END IF;
END LOOP;
cmd:=gen_random_uuid();PERFORM public.admin_review_rescheduling(rid,rev,'validada','QA reversible',cmd);PERFORM public.admin_review_rescheduling(rid,rev,'validada','QA reversible',cmd);
IF (SELECT review_status FROM public.reservation_rescheduling_requests WHERE reservation_id=rid)<>'validada' THEN RAISE EXCEPTION 'Review failed';END IF;
BEGIN PERFORM public.admin_review_rescheduling(rid,rev,'requiere_contacto','different',cmd);RAISE EXCEPTION 'Collision accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Identificador ya utilizado para otra operación' THEN RAISE;END IF;END;
IF (SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) FROM public.event_reservations r WHERE event_id=ev) IS DISTINCT FROM before_res THEN RAISE EXCEPTION 'Reservation mutation';END IF;
BEGIN INSERT INTO public.training_camp_credit_accounts(source_reservation_id,beneficiary_alumno_id) VALUES(rid,gen_random_uuid());RAISE EXCEPTION 'Credit emission allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Operaciones financieras bloqueadas%' THEN RAISE;END IF;END;
END $$;
ROLLBACK;