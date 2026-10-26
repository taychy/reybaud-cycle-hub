CREATE OR REPLACE FUNCTION public.guard_room_assignment_withdrawn_seat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rescheduling_seat_releases s
             WHERE s.source_reservation_id = NEW.reservation_id
               AND s.state IN ('liberada','ofrecida','ocupada')) THEN
    RAISE EXCEPTION 'La reserva tiene la plaza liberada por baja aprobada; no puede ocupar una habitación';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_room_assignment_withdrawn_seat ON public.event_room_assignments;
CREATE TRIGGER trg_room_assignment_withdrawn_seat
BEFORE INSERT OR UPDATE OF reservation_id, room_id ON public.event_room_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_room_assignment_withdrawn_seat();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='event_room_assignments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_room_assignments; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='event_rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_rooms; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='event_reservations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_reservations; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='rescheduling_seat_releases') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rescheduling_seat_releases; END IF;
END $$;