-- Closed-inventory QA for San Luis rescheduling. Privileged runner only; everything is rolled back.
BEGIN;
DO $$ DECLARE ev uuid:='67b4e85d-b00b-4b74-9644-99458d948c65'; rid uuid; rep uuid; pkg uuid; rev int; s jsonb; cmd uuid; before_res text; inv jsonb; ok boolean;
BEGIN
 SELECT package_id INTO pkg FROM event_reservations WHERE event_id=ev AND reservation_status='reserva_confirmada' GROUP BY package_id HAVING count(*)>=2 ORDER BY count(*) DESC LIMIT 1;
 SELECT id INTO rid FROM event_reservations WHERE event_id=ev AND package_id=pkg AND reservation_status='reserva_confirmada' AND id NOT IN (SELECT original_reservation_id FROM reservation_transfers) ORDER BY id LIMIT 1;
 SELECT id INTO rep FROM event_reservations WHERE event_id=ev AND package_id=pkg AND reservation_status='reserva_confirmada' AND id<>rid ORDER BY id LIMIT 1;
 SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) INTO before_res FROM event_reservations r WHERE event_id=ev;
 -- Visitor
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM admin_rescheduling_inventory(ev); RAISE EXCEPTION 'visitor read inventory'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE; END IF; END;
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'confirm_renunciation','motivo QA',0,gen_random_uuid()); RAISE EXCEPTION 'visitor acted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'confirm_renunciation','motivo QA',0,gen_random_uuid()); RAISE EXCEPTION 'non-admin acted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE; END IF; END;
 -- Admin
 PERFORM set_config('request.jwt.claims','{"sub":"0d70cac6-b7ff-4041-a90e-d40614f39622","role":"authenticated"}',true);
 inv:=admin_rescheduling_inventory(ev);
 IF (inv->>'active_reservations')::int<>32 OR (SELECT sum((p->>'sellable')::int) FROM jsonb_array_elements(inv->'packages') p)<>0 THEN RAISE EXCEPTION 'Inventory must start at zero sellable over 32 active'; END IF;
 -- Request alone does not release
 PERFORM submit_rescheduling_request(ev,rid,'{"choice":"refund","consent":true,"source":"QA","note":"QA"}',0,gen_random_uuid());
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'confirm_renunciation','motivo QA',0,gen_random_uuid()); RAISE EXCEPTION 'unvalidated request confirmed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Requiere solicitud%' THEN RAISE; END IF; END;
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'approve_release','motivo QA',0,gen_random_uuid()); RAISE EXCEPTION 'release without confirmation'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Primero confirmá la renuncia' THEN RAISE; END IF; END;
 SELECT revision INTO rev FROM reservation_rescheduling_requests WHERE reservation_id=rid;
 PERFORM admin_review_rescheduling(rid,rev,'validada','QA validada',gen_random_uuid());
 -- Confirm (double click = same command)
 cmd:=gen_random_uuid();
 s:=admin_rescheduling_seat_action(rid,'confirm_renunciation','Renuncia verificada QA',0,cmd);
 s:=admin_rescheduling_seat_action(rid,'confirm_renunciation','Renuncia verificada QA',0,cmd);
 IF (SELECT count(*) FROM rescheduling_seat_history h JOIN rescheduling_seat_releases r ON r.id=h.release_id WHERE r.source_reservation_id=rid)<>1 THEN RAISE EXCEPTION 'double click duplicated'; END IF;
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'confirm_renunciation','otra',0,gen_random_uuid()); RAISE EXCEPTION 'stale version accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'El cupo cambió%' THEN RAISE; END IF; END;
 -- Validated but not approved: still zero
 inv:=admin_rescheduling_inventory(ev);
 IF (SELECT sum((p->>'released')::int+(p->>'sellable')::int) FROM jsonb_array_elements(inv->'packages') p)<>0 THEN RAISE EXCEPTION 'confirmation released seat'; END IF;
 -- Decision change before approval invalidates
 SELECT revision INTO rev FROM reservation_rescheduling_requests WHERE reservation_id=rid;
 PERFORM submit_rescheduling_request(ev,rid,'{"choice":"attend_5_9","consent":true,"source":"QA","note":"QA"}',rev,gen_random_uuid());
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'approve_release','motivo QA',1,gen_random_uuid()); RAISE EXCEPTION 'stale decision approved'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'La solicitud cambió%' THEN RAISE; END IF; END;
 PERFORM admin_rescheduling_seat_action(rid,'revoke','Cambió de decisión',1,gen_random_uuid());
 SELECT revision INTO rev FROM reservation_rescheduling_requests WHERE reservation_id=rid;
 PERFORM submit_rescheduling_request(ev,rid,'{"choice":"refund","consent":true,"source":"QA","note":"QA"}',rev,gen_random_uuid());
 SELECT revision INTO rev FROM reservation_rescheduling_requests WHERE reservation_id=rid;
 PERFORM admin_review_rescheduling(rid,rev,'validada','QA validada 2',gen_random_uuid());
 PERFORM admin_rescheduling_seat_action(rid,'confirm_renunciation','Renuncia verificada QA 2',2,gen_random_uuid());
 PERFORM admin_rescheduling_seat_action(rid,'approve_release','Liberación aprobada QA',3,gen_random_uuid());
 -- Participant can no longer silently undo
 SELECT revision INTO rev FROM reservation_rescheduling_requests WHERE reservation_id=rid;
 BEGIN PERFORM submit_rescheduling_request(ev,rid,'{"choice":"attend_5_8","consent":true,"source":"QA","note":"QA"}',rev,gen_random_uuid()); RAISE EXCEPTION 'undo after release'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'La plaza ya fue liberada%' THEN RAISE; END IF; END;
 -- Offer blocked while resale disabled
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'offer','Ofrecer QA',4,gen_random_uuid()); RAISE EXCEPTION 'offer without resale'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Reventa no habilitada para esta campaña' THEN RAISE; END IF; END;
 UPDATE event_rescheduling_campaigns SET resale_enabled=true WHERE event_id=ev;
 PERFORM admin_rescheduling_seat_action(rid,'offer','Ofrecer QA',4,gen_random_uuid());
 -- Pre-existing reservation cannot count as replacement
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'occupy','Ocupar QA',5,gen_random_uuid(),rep,'attend_5_8'); RAISE EXCEPTION 'old reservation used'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'El reemplazo debe ser posterior%' THEN RAISE; END IF; END;
 UPDATE rescheduling_seat_releases SET approved_at='2000-01-01' WHERE source_reservation_id=rid; -- test-only, rolled back
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'occupy','Ocupar QA',5,gen_random_uuid(),rid,'attend_5_8'); RAISE EXCEPTION 'self replacement'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'El reemplazo debe ser una reserva%' THEN RAISE; END IF; END;
 PERFORM admin_rescheduling_seat_action(rid,'occupy','Ocupar QA',5,gen_random_uuid(),rep,'attend_5_8');
 -- Sell twice
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'occupy','Ocupar QA 2',6,gen_random_uuid(),rep,'attend_6_9'); RAISE EXCEPTION 'sold twice'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Solo cupos ofrecidos pueden ocuparse' THEN RAISE; END IF; END;
 -- Overlapping nights 6-8 rejected by constraint even bypassing RPC
 ok:=false;
 BEGIN INSERT INTO rescheduling_seat_occupancies(release_id,replacement_reservation_id,window_choice,nights,created_by) SELECT id,(SELECT id FROM event_reservations WHERE event_id=ev AND id NOT IN (rid,rep) LIMIT 1),'attend_6_9',daterange('2026-11-06','2026-11-09','[)'),auth.uid() FROM rescheduling_seat_releases WHERE source_reservation_id=rid;
 EXCEPTION WHEN exclusion_violation THEN ok:=true; END;
 IF NOT ok THEN RAISE EXCEPTION 'overlap accepted'; END IF;
 BEGIN PERFORM admin_rescheduling_seat_action(rid,'revoke','Anular ocupado',6,gen_random_uuid()); RAISE EXCEPTION 'occupied revoked'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Solo se anulan cupos no ocupados' THEN RAISE; END IF; END;
 IF (SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) FROM event_reservations r WHERE event_id=ev)<>before_res THEN RAISE EXCEPTION 'reservations mutated'; END IF;
 RAISE NOTICE 'SEAT INVENTORY QA OK';
END $$;
ROLLBACK;
SELECT (SELECT count(*) FROM rescheduling_seat_releases) releases,(SELECT count(*) FROM rescheduling_seat_occupancies) occ,(SELECT count(*) FROM reservation_rescheduling_requests) requests,(SELECT count(*) FROM rescheduling_settlement_proposals) proposals,(SELECT count(*) FROM training_camp_credit_accounts) accounts,(SELECT count(*) FROM training_camp_credit_ledger) ledger,(SELECT public_enabled::text||'/'||resale_enabled::text FROM event_rescheduling_campaigns WHERE event_id='67b4e85d-b00b-4b74-9644-99458d948c65') flags;
