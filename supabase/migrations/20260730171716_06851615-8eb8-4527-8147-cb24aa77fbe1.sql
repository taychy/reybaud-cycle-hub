CREATE OR REPLACE FUNCTION public.get_my_reservation_lodging(_reservation_id uuid)
RETURNS TABLE (
  package_nombre text,
  room_id uuid,
  room_nombre text,
  room_tipo text,
  room_genero text,
  room_capacidad integer,
  roommates text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room uuid;
  v_pkg text;
BEGIN
  SELECT er.package_nombre_snapshot INTO v_pkg
  FROM event_reservations er
  JOIN alumnos a ON a.id = er.alumno_id
  WHERE er.id = _reservation_id AND lower(a.email) = lower(auth.email());

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT era.room_id INTO v_room
  FROM event_room_assignments era
  WHERE era.reservation_id = _reservation_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_pkg,
    r.id,
    r.nombre,
    r.tipo,
    r.genero,
    r.capacidad,
    COALESCE((
      SELECT array_agg(
        COALESCE(NULLIF(btrim(concat_ws(' ', al.nombre, al.apellido)), ''),
                 NULLIF(btrim(concat_ws(' ', er2.external_first_name, er2.external_last_name)), ''),
                 'Participante')
        ORDER BY 1
      )
      FROM event_room_assignments era2
      JOIN event_reservations er2 ON er2.id = era2.reservation_id
      LEFT JOIN alumnos al ON al.id = er2.alumno_id
      WHERE era2.room_id = v_room AND era2.reservation_id <> _reservation_id
    ), ARRAY[]::text[])
  FROM event_rooms r
  WHERE r.id = v_room;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_pkg, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::integer, ARRAY[]::text[];
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_reservation_lodging(uuid) TO authenticated;