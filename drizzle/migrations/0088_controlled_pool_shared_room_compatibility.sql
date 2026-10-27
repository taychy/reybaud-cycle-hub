CREATE OR REPLACE FUNCTION public.enforce_event_room_package_consistency()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_room record; v_reservation record; v_room_package_name text; v_current_package_name text;
BEGIN
 SELECT r.id,r.event_id,r.package_id,r.nombre INTO v_room FROM public.event_rooms r WHERE r.id=NEW.room_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Habitación no encontrada'; END IF;
 SELECT er.id,er.event_id,er.package_id,er.package_nombre_snapshot INTO v_reservation FROM public.event_reservations er WHERE er.id=NEW.reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
 IF v_reservation.event_id IS DISTINCT FROM v_room.event_id THEN RAISE EXCEPTION 'La habitación y la reserva pertenecen a eventos distintos'; END IF;
 IF v_room.package_id IS NULL THEN RETURN NEW; END IF;
 SELECT nombre INTO v_room_package_name FROM public.event_packages WHERE id=v_room.package_id;
 IF v_room_package_name IS NULL THEN RAISE EXCEPTION 'La habitación tiene un paquete inválido'; END IF;
 IF v_reservation.package_id IS NULL THEN
  PERFORM public.sync_reservation_package_from_room(NEW.reservation_id,v_room.package_id,'asignación de habitación'); RETURN NEW;
 END IF;
 IF v_reservation.package_id IS DISTINCT FROM v_room.package_id THEN
  -- Only an explicitly shared controlled-event pool permits different tariffs in the same physical room.
  IF EXISTS(SELECT 1 FROM public.event_booking_openings o
   JOIN public.event_packages rp ON rp.id=v_room.package_id AND rp.event_id=o.event_id
   JOIN public.event_packages sp ON sp.id=v_reservation.package_id AND sp.event_id=o.event_id
   WHERE o.event_id=v_room.event_id AND nullif(lower(btrim(rp.lodging_group_key)),'') IS NOT NULL
    AND nullif(lower(btrim(rp.lodging_group_key)),'')=nullif(lower(btrim(sp.lodging_group_key)),'')) THEN RETURN NEW; END IF;
  SELECT nombre INTO v_current_package_name FROM public.event_packages WHERE id=v_reservation.package_id;
  RAISE EXCEPTION USING MESSAGE=format('La habitación %s pertenece al paquete "%s", pero la reserva tiene "%s". Cambiá el paquete de la reserva antes de asignar esta habitación.',v_room.nombre,v_room_package_name,COALESCE(v_current_package_name,v_reservation.package_nombre_snapshot,'otro paquete')),ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END;
$function$;