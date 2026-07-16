CREATE OR REPLACE FUNCTION public.get_package_available_spots(p_package_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_capacity integer;
  v_taken integer;
BEGIN
  -- Capacidad total = suma de capacidad de las habitaciones vinculadas al paquete
  SELECT COALESCE(SUM(capacidad), 0) INTO v_total_capacity
  FROM public.event_rooms
  WHERE package_id = p_package_id;

  -- Sin habitaciones cargadas => no se puede vender
  IF v_total_capacity = 0 THEN
    RETURN 0;
  END IF;

  -- Ocupadas = asignaciones activas (reservas no canceladas/rechazadas/expiradas)
  SELECT COUNT(*) INTO v_taken
  FROM public.event_room_assignments era
  JOIN public.event_rooms er ON er.id = era.room_id
  JOIN public.event_reservations res ON res.id = era.reservation_id
  WHERE er.package_id = p_package_id
    AND res.reservation_status NOT IN ('cancelada','rechazada','expirada');

  RETURN GREATEST(v_total_capacity - v_taken, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_package_available_spots(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_package_available_spots(uuid) TO service_role;