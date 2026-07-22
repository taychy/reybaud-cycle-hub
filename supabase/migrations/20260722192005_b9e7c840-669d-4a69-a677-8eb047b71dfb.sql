
ALTER TABLE public.event_packages
  ADD COLUMN IF NOT EXISTS sin_alojamiento boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_package_availability_breakdown(p_package_id uuid)
RETURNS TABLE(tipo text, genero text, capacity integer, taken integer, available integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sin_aloj boolean;
  v_cupo integer;
BEGIN
  SELECT ep.sin_alojamiento, COALESCE(ep.cupo, 0)
    INTO v_sin_aloj, v_cupo
  FROM public.event_packages ep
  WHERE ep.id = p_package_id;

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
      WHERE er.package_id = p_package_id
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
$$;

GRANT EXECUTE ON FUNCTION public.get_package_availability_breakdown(uuid) TO anon, authenticated, service_role;
