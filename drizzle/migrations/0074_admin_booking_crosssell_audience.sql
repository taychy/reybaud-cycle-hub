CREATE OR REPLACE FUNCTION public.admin_booking_crosssell_audience(p_event_id uuid, p_source_event_id uuid)
RETURNS TABLE(source_reservation_id uuid, nombre text, email text, source_status text, already_requested boolean, already_reserved boolean, marketing_opt_out boolean, alps_rate_eligible boolean, roommate text, invite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_event_id = p_source_event_id THEN RAISE EXCEPTION 'El viaje de origen debe ser distinto'; END IF;
 RETURN QUERY
 WITH src AS (
  SELECT r.id, r.reservation_status::text st,
   trim(coalesce(nullif(trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,'')),''), trim(coalesce(r.external_first_name,'')||' '||coalesce(r.external_last_name,'')))) nm,
   lower(trim(coalesce(nullif(r.external_email,''),a.email))) em,
   coalesce((SELECT string_agg(rr.nombre,', ') FROM reservation_roommates rr WHERE rr.reservation_id=r.id), nullif(r.rooming_acompanante_nombre,'')) mate
  FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id
  WHERE r.event_id=p_source_event_id AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada')
 ), f AS (
  SELECT s.*,
   EXISTS(SELECT 1 FROM event_waitlist_entries w WHERE w.event_id=p_event_id AND lower(trim(w.email))=s.em) req,
   EXISTS(SELECT 1 FROM event_reservations x LEFT JOIN alumnos b ON b.id=x.alumno_id WHERE x.event_id=p_event_id AND x.cancelled_at IS NULL AND x.reservation_status NOT IN ('cancelada','rechazada') AND lower(trim(coalesce(nullif(x.external_email,''),b.email)))=s.em) res,
   EXISTS(SELECT 1 FROM marketing_contacts m WHERE lower(trim(m.email))=s.em AND m.opt_out_at IS NOT NULL) oo
  FROM src s
 )
 SELECT f.id, f.nm, f.em, f.st, f.req, f.res, f.oo, f.st='reserva_confirmada', f.mate,
  (NOT f.req AND NOT f.res AND NOT f.oo AND f.em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
 FROM f ORDER BY f.nm;
END $$;
REVOKE ALL ON FUNCTION public.admin_booking_crosssell_audience(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_booking_crosssell_audience(uuid,uuid) TO authenticated;