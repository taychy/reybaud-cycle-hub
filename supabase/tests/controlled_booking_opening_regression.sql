-- Execute only with an authorized test runner; every change is rolled back.
BEGIN;
DO $$
DECLARE s jsonb; before_count integer; after_count integer;
BEGIN
 SELECT count(*) INTO before_count FROM public.event_reservations WHERE event_id='78a739f4-9b06-47af-bc6d-d8a1705e2477';
 s:=public.event_booking_opening_status('78a739f4-9b06-47af-bc6d-d8a1705e2477');
 IF s->>'enabled'<>'false' OR s->>'ready'<>'false' OR (s->>'capacity')::integer<>0 THEN RAISE EXCEPTION 'Unverified opening must be closed with zero capacity'; END IF;
 IF (s->>'deposit')::integer<>500 OR (s->>'installments')::integer<>8 THEN RAISE EXCEPTION 'Expected EUR 500 and eight installments'; END IF;
 BEGIN
  INSERT INTO public.event_reservations(event_id,package_id,external_email,created_by,reservation_status)
  VALUES('78a739f4-9b06-47af-bc6d-d8a1705e2477','8ae87201-b837-40ab-81ca-f46fa92aa62b','isolated-opening-test@example.invalid','admin','reserva_confirmada');
  RAISE EXCEPTION 'unexpected_allowed_booking';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='unexpected_allowed_booking' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE '%bloqueada%' AND SQLERRM NOT LIKE '%inactivo%' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO after_count FROM public.event_reservations WHERE event_id='78a739f4-9b06-47af-bc6d-d8a1705e2477';
 IF before_count<>after_count THEN RAISE EXCEPTION 'Blocked request created a reservation'; END IF;
END $$;
ROLLBACK;