CREATE OR REPLACE FUNCTION public.get_reservation_participant_by_token(p_token text)
RETURNS TABLE(id uuid, nombre text, apellido text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.nombre, a.apellido, a.email
  FROM public.event_reservations r
  JOIN public.alumnos a ON a.id = r.alumno_id
  WHERE r.access_token = p_token
    AND r.external_participant_id IS NULL
    AND r.alumno_id IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_reservation_participant_by_token(text) TO anon, authenticated;