-- Identity + communications QA for San Luis rescheduling. Privileged runner; no identity data is printed; everything rolled back.
BEGIN;
DO $$ DECLARE ev uuid:='67b4e85d-b00b-4b74-9644-99458d948c65'; a uuid; b uuid; ta text; tb text; doc text; fn text; ln text; v jsonb; g text; ctx jsonb; i int; before_res text; m jsonb; cmd uuid;
BEGIN
 SELECT er.id,er.access_token,coalesce(nullif(al.documento,''),ep.documento),coalesce(nullif(al.nombre,''),ep.nombre),coalesce(nullif(al.apellido,''),ep.apellido) INTO a,ta,doc,fn,ln
  FROM event_reservations er LEFT JOIN alumnos al ON al.id=er.alumno_id LEFT JOIN event_external_participants ep ON ep.id=er.external_participant_id
  WHERE er.event_id=ev AND er.reservation_status='reserva_confirmada' ORDER BY er.id LIMIT 1;
 SELECT id,access_token INTO b,tb FROM event_reservations WHERE event_id=ev AND reservation_status='reserva_confirmada' AND id<>a ORDER BY id LIMIT 1;
 SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) INTO before_res FROM event_reservations r WHERE event_id=ev;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF verify_rescheduling_identity(ev,a,ta,doc,fn,ln)->>'reason'<>'unavailable' THEN RAISE EXCEPTION 'closed campaign verified'; END IF;
 UPDATE event_rescheduling_campaigns SET public_enabled=true WHERE event_id=ev;
 ctx:=get_rescheduling_context(ev,a,ta);
 IF ctx->>'verification_required'<>'true' OR ctx ? 'reservations' OR ctx ? 'campaign' THEN RAISE EXCEPTION 'token alone exposed data'; END IF;
 BEGIN PERFORM submit_rescheduling_request(ev,a,'{"choice":"help","consent":true}',0,gen_random_uuid(),ta); RAISE EXCEPTION 'raw token wrote'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE; END IF; END;
 IF verify_rescheduling_identity(ev,a,ta,'00000000',fn,ln)->>'ok'<>'false' THEN RAISE EXCEPTION 'wrong dni'; END IF;
 IF verify_rescheduling_identity(ev,a,tb,doc,fn,ln)->>'ok'<>'false' THEN RAISE EXCEPTION 'cross token'; END IF;
 IF verify_rescheduling_identity(ev,a,NULL,doc,fn,ln)->>'ok'<>'false' THEN RAISE EXCEPTION 'no token'; END IF;
 IF verify_rescheduling_identity(ev,a,ta,doc,'Zzzz',ln)->>'ok'<>'false' THEN RAISE EXCEPTION 'wrong name'; END IF;
 v:=verify_rescheduling_identity(ev,a,ta,' '||doc||' ','  '||upper(fn),upper(ln)||' ');
 IF v->>'ok'<>'true' OR (v->>'session') !~ '^rsg_[a-f0-9]{64}$' OR v ? 'participant' THEN RAISE EXCEPTION 'case-insensitive verification failed'; END IF;
 g:=v->>'session';
 IF EXISTS (SELECT 1 FROM rescheduling_guest_sessions WHERE session_hash=g) THEN RAISE EXCEPTION 'raw session stored'; END IF;
 ctx:=get_rescheduling_context(ev,a,g);
 IF jsonb_array_length(ctx->'reservations')<>1 OR ctx->'reservations'->0->>'reservation_id'<>a::text THEN RAISE EXCEPTION 'guest session failed'; END IF;
 IF get_rescheduling_context(ev,b,g)->>'verification_required'<>'true' THEN RAISE EXCEPTION 'guest session crossed reservations'; END IF;
 IF get_rescheduling_context(ev,NULL,g)->>'verification_required'<>'true' THEN RAISE EXCEPTION 'guest session listed event'; END IF;
 v:=submit_rescheduling_request(ev,a,'{"choice":"attend_5_9","consent":true}',0,gen_random_uuid(),g);
 IF v->>'origin'<>'personal_token' OR v->>'choice'<>'attend_5_9' THEN RAISE EXCEPTION 'guest save failed'; END IF;
 IF (SELECT count(*) FROM reservation_rescheduling_history WHERE reservation_id=a)<>1 THEN RAISE EXCEPTION 'history missing'; END IF;
 UPDATE rescheduling_guest_sessions SET expires_at=now()-interval '1 second' WHERE reservation_id=a;
 IF get_rescheduling_context(ev,a,g)->>'verification_required'<>'true' THEN RAISE EXCEPTION 'expired session accepted'; END IF;
 -- Session of another person never opens this reservation
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"otro@example.com","role":"authenticated"}',true);
 IF jsonb_array_length(coalesce(get_rescheduling_context(ev,a)->'reservations','[]'))<>0 THEN RAISE EXCEPTION 'other session opened'; END IF;
 BEGIN PERFORM admin_rescheduling_comm_list(ev); RAISE EXCEPTION 'non-admin comm list'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE; END IF; END;
 -- Rate limit (failures accumulate per reservation)
 PERFORM set_config('request.jwt.claims','{}',true);
 FOR i IN 1..5 LOOP PERFORM verify_rescheduling_identity(ev,b,tb,'11111111','Xx','Yy'); END LOOP;
 IF verify_rescheduling_identity(ev,b,tb,'11111111','Xx','Yy')->>'reason'<>'rate_limited' THEN RAISE EXCEPTION 'rate limit missing'; END IF;
 -- Admin communications
 PERFORM set_config('request.jwt.claims','{"sub":"0d70cac6-b7ff-4041-a90e-d40614f39622","role":"authenticated"}',true);
 IF jsonb_array_length(admin_rescheduling_comm_list(ev))<>32 THEN RAISE EXCEPTION 'comm list must hold 32 active'; END IF;
 BEGIN PERFORM admin_rescheduling_comm_mark(b,'whatsapp','enviado','',0,gen_random_uuid()); RAISE EXCEPTION 'sent without proof'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Indicá%' THEN RAISE; END IF; END;
 cmd:=gen_random_uuid();
 m:=admin_rescheduling_comm_mark(b,'whatsapp','enviado','Constancia QA',0,cmd);
 m:=admin_rescheduling_comm_mark(b,'whatsapp','enviado','Constancia QA',0,cmd);
 IF (SELECT count(*) FROM rescheduling_communication_log WHERE reservation_id=b)<>1 THEN RAISE EXCEPTION 'double click logged twice'; END IF;
 BEGIN PERFORM admin_rescheduling_comm_mark(b,'whatsapp','enviado','Otra constancia',1,gen_random_uuid()); RAISE EXCEPTION 'duplicate send'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Ya figura enviado%' THEN RAISE; END IF; END;
 IF (SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) FROM event_reservations r WHERE event_id=ev)<>before_res THEN RAISE EXCEPTION 'reservations mutated'; END IF;
 RAISE NOTICE 'IDENTITY QA OK';
END $$;
ROLLBACK;
