CREATE OR REPLACE FUNCTION public.get_package_availability_breakdown(p_package_id uuid)
 RETURNS TABLE(tipo text, genero text, capacity integer, taken integer, available integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sin_aloj boolean;
  v_cupo integer;
  v_group text;
  v_pkg_ids uuid[];
BEGIN
  SELECT ep.sin_alojamiento, COALESCE(ep.cupo, 0), NULLIF(btrim(lower(ep.lodging_group_key)), '')
    INTO v_sin_aloj, v_cupo, v_group
  FROM public.event_packages ep
  WHERE ep.id = p_package_id;

  IF v_group IS NULL THEN
    v_pkg_ids := ARRAY[p_package_id];
  ELSE
    SELECT array_agg(ep.id) INTO v_pkg_ids
    FROM public.event_packages ep
    WHERE NULLIF(btrim(lower(ep.lodging_group_key)), '') = v_group
      AND ep.event_id = (SELECT event_id FROM public.event_packages WHERE id = p_package_id);
  END IF;

  IF v_sin_aloj THEN
    RETURN QUERY
      WITH taken AS (
        SELECT COUNT(*)::int AS n
        FROM public.event_reservations res
        WHERE res.package_id = p_package_id
          AND res.reservation_status NOT IN ('cancelada','rechazada','expirada')
      )
      SELECT
        'dia'::text AS tipo,
        'mixta'::text AS genero,
        v_cupo AS capacity,
        t.n AS taken,
        GREATEST(v_cupo - t.n, 0) AS available
      FROM taken t;
    RETURN;
  END IF;

  RETURN QUERY
    WITH rooms AS (
      SELECT er.id, COALESCE(er.tipo, 'otro') AS tipo, COALESCE(er.genero, 'mixta') AS genero, er.capacidad
      FROM public.event_rooms er
      WHERE er.package_id = ANY(v_pkg_ids)
    ),
    taken AS (
      SELECT er.id AS room_id, COUNT(era.id)::int AS taken
      FROM rooms er
      LEFT JOIN public.event_room_assignments era ON era.room_id = er.id
      LEFT JOIN public.event_reservations res ON res.id = era.reservation_id
        AND res.reservation_status NOT IN ('cancelada','rechazada','expirada')
      GROUP BY er.id
    )
    SELECT
      r.tipo,
      r.genero,
      SUM(r.capacidad)::int AS capacity,
      SUM(COALESCE(t.taken,0))::int AS taken,
      GREATEST(SUM(r.capacidad) - SUM(COALESCE(t.taken,0)), 0)::int AS available
    FROM rooms r
    LEFT JOIN taken t ON t.room_id = r.id
    GROUP BY r.tipo, r.genero
    ORDER BY r.tipo, r.genero;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_package_available_spots(p_package_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_capacity integer;
  v_taken integer;
  v_group text;
  v_pkg_ids uuid[];
BEGIN
  SELECT NULLIF(btrim(lower(ep.lodging_group_key)), '') INTO v_group
  FROM public.event_packages ep WHERE ep.id = p_package_id;

  IF v_group IS NULL THEN
    v_pkg_ids := ARRAY[p_package_id];
  ELSE
    SELECT array_agg(ep.id) INTO v_pkg_ids
    FROM public.event_packages ep
    WHERE NULLIF(btrim(lower(ep.lodging_group_key)), '') = v_group
      AND ep.event_id = (SELECT event_id FROM public.event_packages WHERE id = p_package_id);
  END IF;

  SELECT COALESCE(SUM(capacidad), 0) INTO v_total_capacity
  FROM public.event_rooms
  WHERE package_id = ANY(v_pkg_ids);

  IF v_total_capacity = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_taken
  FROM public.event_room_assignments era
  JOIN public.event_rooms er ON er.id = era.room_id
  JOIN public.event_reservations res ON res.id = era.reservation_id
  WHERE er.package_id = ANY(v_pkg_ids)
    AND res.reservation_status NOT IN ('cancelada','rechazada','expirada');

  RETURN GREATEST(v_total_capacity - v_taken, 0);
END;
$function$;