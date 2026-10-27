-- Isolated fixture only: execute after fixture, migration 0087, availability regression and migration 0088.
ALTER TABLE public.event_packages ADD COLUMN nombre text;
ALTER TABLE public.event_rooms ADD COLUMN event_id uuid, ADD COLUMN nombre text;
ALTER TABLE public.event_reservations ADD COLUMN package_nombre_snapshot text;
CREATE FUNCTION public.sync_reservation_package_from_room(uuid,uuid,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Must not rewrite commercial package for shared room'; END $$;
CREATE TRIGGER test_room_consistency BEFORE INSERT ON public.event_room_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_event_room_package_consistency();
UPDATE public.event_packages SET nombre=id::text,lodging_group_key='shared_global_double' WHERE event_id='00000000-0000-0000-0000-000000000001';
INSERT INTO public.event_rooms(id,package_id,capacidad,event_id,nombre) VALUES ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000011',2,'00000000-0000-0000-0000-000000000001','Double');
-- A different tariff in the same explicitly shared pool is compatible and retains its package.
INSERT INTO public.event_room_assignments VALUES ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000106');
DO $$ BEGIN
 IF (SELECT package_id FROM public.event_reservations WHERE id='00000000-0000-0000-0000-000000000106')<>'00000000-0000-0000-0000-000000000012'::uuid THEN RAISE EXCEPTION 'Shared room must preserve selected tariff'; END IF;
END $$;
-- Different groups still fail; no weakening of ordinary package consistency.
UPDATE public.event_packages SET lodging_group_key='different' WHERE id='00000000-0000-0000-0000-000000000013';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.event_room_assignments VALUES ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000107');
  RAISE EXCEPTION 'Different lodging groups must be rejected';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
DO $$ BEGIN
 BEGIN
  INSERT INTO public.event_room_assignments VALUES ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000301');
  RAISE EXCEPTION 'Cross-event room must be rejected';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Cross-event room must be rejected' THEN RAISE; END IF;
 END;
END $$;