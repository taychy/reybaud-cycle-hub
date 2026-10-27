-- Uses the actual migrated commercial-availability function in an isolated database.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT id FROM public.event_packages LOOP
  IF public.get_package_available_spots(p.id)<>15 THEN RAISE EXCEPTION 'Expected 15 of global 20, five solicitud_enviada consume seats without rooms; waitlist does not'; END IF;
 END LOOP;
END $$;
INSERT INTO public.event_reservations VALUES ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','solicitud_enviada',NULL);
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT id FROM public.event_packages LOOP
  IF public.get_package_available_spots(p.id)<>14 THEN RAISE EXCEPTION 'Every modality must consume the same pool'; END IF;
 END LOOP;
END $$;
INSERT INTO public.event_reservations SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013','solicitud_enviada',NULL FROM generate_series(107,120) n;
DO $$ BEGIN
 IF public.get_package_available_spots('00000000-0000-0000-0000-000000000014')<>0 THEN RAISE EXCEPTION 'Twenty means full'; END IF;
END $$;
UPDATE public.event_reservations SET cancelled_at=now() WHERE id='00000000-0000-0000-0000-000000000120';
DO $$ BEGIN
 IF public.get_package_available_spots('00000000-0000-0000-0000-000000000014')<>1 THEN RAISE EXCEPTION 'Cancellation frees one shared seat'; END IF;
END $$;
UPDATE public.event_booking_openings SET enabled=false;
DO $$ BEGIN
 IF public.get_package_available_spots('00000000-0000-0000-0000-000000000014')<>0 THEN RAISE EXCEPTION 'Disabled opening fails closed'; END IF;
END $$;
-- Ordinary room inventory remains unchanged, including unassigned and released seats.
INSERT INTO public.event_packages VALUES ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000002',NULL);
INSERT INTO public.event_rooms VALUES ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000021',3);
INSERT INTO public.event_reservations VALUES ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000021','reserva_confirmada',NULL);
DO $$ BEGIN
 IF public.get_package_available_spots('00000000-0000-0000-0000-000000000021')<>2 THEN RAISE EXCEPTION 'Ordinary unassigned reservation consumes physical seat'; END IF;
END $$;
INSERT INTO public.rescheduling_seat_releases VALUES ('00000000-0000-0000-0000-000000000301','liberada');
DO $$ BEGIN
 IF public.get_package_available_spots('00000000-0000-0000-0000-000000000021')<>3 THEN RAISE EXCEPTION 'Ordinary released seat remains excluded'; END IF;
END $$;