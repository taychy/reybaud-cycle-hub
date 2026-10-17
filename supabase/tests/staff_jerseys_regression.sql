BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.event_kit_additional_jerseys WHERE event_id='67b4e85d-b00b-4b74-9644-99458d948c65' AND active) <> 3 THEN RAISE EXCEPTION 'Expected three staff fixtures'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.event_kit_additional_jerseys) THEN RAISE EXCEPTION 'Non-admin read allowed'; END IF;
 IF EXISTS(SELECT 1 FROM public.event_kit_additional_jerseys_log) THEN RAISE EXCEPTION 'Non-admin log read allowed'; END IF;
 BEGIN
  INSERT INTO public.event_kit_additional_jerseys(event_id,recipient_name,staff_key,size) VALUES('67b4e85d-b00b-4b74-9644-99458d948c65','QA Staff','qa staff','XS');
  RAISE EXCEPTION 'Non-admin insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN raise_exception THEN IF SQLERRM <> 'Solo administración' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"0d70cac6-b7ff-4041-a90e-d40614f39622","role":"authenticated"}',true);
DO $$ DECLARE entry uuid; n integer; BEGIN
 IF (SELECT count(*) FROM public.event_kit_additional_jerseys WHERE event_id='67b4e85d-b00b-4b74-9644-99458d948c65' AND active) <> 3 THEN RAISE EXCEPTION 'Admin read denied'; END IF;
 INSERT INTO public.event_kit_additional_jerseys(event_id,recipient_name,staff_key,size) VALUES('67b4e85d-b00b-4b74-9644-99458d948c65','QA Staff','ignored key','XS') RETURNING id INTO entry;
 IF NOT EXISTS(SELECT 1 FROM public.event_kit_additional_jerseys_log WHERE entry_id=entry AND actor_id=auth.uid() AND action='INSERT') THEN RAISE EXCEPTION 'Missing actor audit'; END IF;
 SELECT count(*) INTO n FROM public.event_kit_additional_jerseys_log WHERE entry_id=entry;
 INSERT INTO public.event_kit_additional_jerseys(event_id,recipient_name,staff_key,size) VALUES('67b4e85d-b00b-4b74-9644-99458d948c65','QA Staff','qa staff','XS') ON CONFLICT(event_id,staff_key) DO UPDATE SET size=EXCLUDED.size;
 IF (SELECT count(*) FROM public.event_kit_additional_jerseys_log WHERE entry_id=entry) <> n THEN RAISE EXCEPTION 'No-op upsert not idempotent'; END IF;
 BEGIN
  UPDATE public.event_kit_additional_jerseys SET size='no_seguro' WHERE id=entry;
  RAISE EXCEPTION 'Uncertain size allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Talle de staff inválido o encuesta inactiva' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.event_kit_additional_jerseys SET quantity=0 WHERE id=entry;
  RAISE EXCEPTION 'Zero quantity allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.event_kit_additional_jerseys SET active=false WHERE id=entry;
 IF NOT EXISTS(SELECT 1 FROM public.event_kit_additional_jerseys_log WHERE entry_id=entry AND action='UPDATE' AND after_data->>'active'='false') THEN RAISE EXCEPTION 'Removal missing audit'; END IF;
 BEGIN
  DELETE FROM public.event_kit_additional_jerseys_log WHERE entry_id=entry;
  RAISE EXCEPTION 'Audit deletion allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;