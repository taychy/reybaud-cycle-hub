-- Run only in an isolated empty PostgreSQL database, then apply migration 0087.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.event_packages(id uuid PRIMARY KEY,event_id uuid,lodging_group_key text);
CREATE TABLE public.event_booking_openings(event_id uuid PRIMARY KEY,enabled boolean,hotel_capacity integer,race_capacity integer);
CREATE TABLE public.event_reservations(id uuid PRIMARY KEY,event_id uuid,package_id uuid,reservation_status text,cancelled_at timestamptz);
CREATE TABLE public.event_rooms(id uuid,package_id uuid,capacidad integer);
CREATE TABLE public.event_room_assignments(room_id uuid,reservation_id uuid);
CREATE TABLE public.rescheduling_seat_releases(source_reservation_id uuid,state text);
CREATE TABLE public.event_waitlist_entries(id uuid,event_id uuid,estado text);
CREATE FUNCTION public.event_booking_opening_status(p_event_id uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('controlled',true,'ready',true,'enabled',o.enabled,'capacity',least(o.hotel_capacity,o.race_capacity),
    'available',greatest(least(o.hotel_capacity,o.race_capacity)-(SELECT count(*) FROM public.event_reservations r WHERE r.event_id=o.event_id AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada')),0))
  FROM public.event_booking_openings o WHERE o.event_id=p_event_id
$$;
INSERT INTO public.event_booking_openings VALUES ('00000000-0000-0000-0000-000000000001',true,20,20);
INSERT INTO public.event_packages SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001',NULL FROM generate_series(11,14) n;
INSERT INTO public.event_reservations SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','solicitud_enviada',NULL FROM generate_series(101,105) n;
INSERT INTO public.event_waitlist_entries VALUES ('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000001','nuevo');