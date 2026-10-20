-- No permitir respuestas editadas ni revisión contradictoria cuando la plaza ya fue liberada.
-- Requiere gestión humana para revocar/liberar nuevamente, evitando doble venta.
CREATE OR REPLACE FUNCTION public._rescheduling_seat_request_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF (NEW.choice IS DISTINCT FROM OLD.choice OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.revision IS DISTINCT FROM OLD.revision OR NEW.jersey_requested IS DISTINCT FROM OLD.jersey_requested) AND EXISTS (SELECT 1 FROM public.rescheduling_seat_releases s WHERE s.source_reservation_id=NEW.reservation_id AND s.state IN ('liberada','ofrecida','ocupada')) THEN
  RAISE EXCEPTION 'La plaza ya fue liberada. Contactá a Administración para revisar la decisión y evitar duplicar el cupo';
 END IF;
 RETURN NEW;
END $function$

