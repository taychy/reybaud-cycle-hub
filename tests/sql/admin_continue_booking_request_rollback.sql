-- Transactional QA for admin_continue_booking_request. Always ends in an exception => full rollback.
-- Expected: preflight (p_confirm=false) mutates nothing; Lourdes (external-only match) converts with
-- external_participant_id set; requester without any record gets ONE new external participant;
-- second call is idempotent (duplicate=true); Alps tariff without active Alps reservation stays blocked.
DO $$
DECLARE r record; out text:=''; j jsonb; before_res int; pk uuid; wid uuid; nx int;
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT user_id::text FROM user_roles WHERE role='admin' LIMIT 1),'role','authenticated')::text, true);
 SELECT count(*) INTO before_res FROM event_reservations WHERE event_id='78a739f4-9b06-47af-bc6d-d8a1705e2477';
 FOR r IN SELECT id,nombre FROM event_waitlist_entries WHERE event_id='78a739f4-9b06-47af-bc6d-d8a1705e2477' ORDER BY created_at LOOP
  j:=admin_continue_booking_request(r.id,false); out:=out||' | PRE '||r.nombre||': '||coalesce(j->>'identity','dup')||' '||coalesce((j->'blockers')::text,'');
 END LOOP;
 IF (SELECT count(*) FROM event_reservations WHERE event_id='78a739f4-9b06-47af-bc6d-d8a1705e2477')<>before_res THEN RAISE EXCEPTION 'QA_FAIL preflight mutated'; END IF;
 j:=admin_continue_booking_request('af733506-b137-4e1d-b0ea-b30a0a6cdb93',true);
 IF (j->>'external_participant_id') IS NULL THEN RAISE EXCEPTION 'QA_FAIL lourdes %', j; END IF;
 IF admin_continue_booking_request('af733506-b137-4e1d-b0ea-b30a0a6cdb93',true)->>'duplicate'<>'true' THEN RAISE EXCEPTION 'QA_FAIL idempotency'; END IF;
 SELECT id INTO pk FROM event_packages WHERE event_id='78a739f4-9b06-47af-bc6d-d8a1705e2477' AND precio=3500 LIMIT 1;
 INSERT INTO event_waitlist_entries(event_id,nombre,email,telefono,origen,estado,respuestas)
 SELECT event_id,'Qa Prueba Rollback','qa.rollback.zz@example.com','+5491100000000',origen,'nuevo',respuestas||jsonb_build_object('package_id',pk::text,'price_eur',3500) FROM event_waitlist_entries WHERE id='af733506-b137-4e1d-b0ea-b30a0a6cdb93' RETURNING id INTO wid;
 j:=admin_continue_booking_request(wid,true); PERFORM admin_continue_booking_request(wid,true);
 SELECT count(*) INTO nx FROM event_external_participants WHERE lower(trim(email))='qa.rollback.zz@example.com';
 IF nx<>1 OR (j->>'ok')<>'true' THEN RAISE EXCEPTION 'QA_FAIL new external % %', nx, j; END IF;
 RAISE EXCEPTION 'QA_ROLLBACK_OK %', out;
END $$;
