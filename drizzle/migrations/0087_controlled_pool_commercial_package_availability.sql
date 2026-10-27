CREATE OR REPLACE FUNCTION public.get_package_available_spots(p_package_id uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_total_capacity integer; v_taken integer; v_unassigned integer; v_group text; v_pkg_ids uuid[]; v_event uuid; v_opening jsonb;
BEGIN
  SELECT ep.event_id, NULLIF(btrim(lower(ep.lodging_group_key)), '') INTO v_event, v_group FROM public.event_packages ep WHERE ep.id = p_package_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.event_booking_openings WHERE event_id = v_event) THEN
    v_opening := public.event_booking_opening_status(v_event);
    IF NOT coalesce((v_opening->>'enabled')::boolean,false) OR NOT coalesce((v_opening->>'ready')::boolean,false) THEN RETURN 0; END IF;
    RETURN greatest(coalesce((v_opening->>'available')::integer,0),0);
  END IF;
  IF v_group IS NULL THEN v_pkg_ids := ARRAY[p_package_id];
  ELSE
    SELECT array_agg(ep.id) INTO v_pkg_ids FROM public.event_packages ep
     WHERE NULLIF(btrim(lower(ep.lodging_group_key)), '') = v_group AND ep.event_id = v_event;
  END IF;
  SELECT COALESCE(SUM(capacidad), 0) INTO v_total_capacity FROM public.event_rooms WHERE package_id = ANY(v_pkg_ids);
  IF v_total_capacity = 0 THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_taken FROM public.event_room_assignments era
  JOIN public.event_rooms er ON er.id = era.room_id
  JOIN public.event_reservations res ON res.id = era.reservation_id
  WHERE er.package_id = ANY(v_pkg_ids) AND res.reservation_status NOT IN ('cancelada','rechazada','expirada');
  SELECT COUNT(*) INTO v_unassigned FROM public.event_reservations res
  WHERE res.package_id = ANY(v_pkg_ids) AND res.reservation_status NOT IN ('cancelada','rechazada','expirada')
    AND NOT EXISTS (SELECT 1 FROM public.event_room_assignments era WHERE era.reservation_id = res.id)
    AND NOT EXISTS (SELECT 1 FROM public.rescheduling_seat_releases s WHERE s.source_reservation_id = res.id AND s.state IN ('liberada','ofrecida','ocupada'));
  RETURN GREATEST(v_total_capacity - v_taken - v_unassigned, 0);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_package_available_spots(uuid) TO anon, authenticated, service_role;