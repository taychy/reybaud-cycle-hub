CREATE OR REPLACE FUNCTION public.get_public_booking_coaches(p_coach_ids uuid[])
RETURNS TABLE(id uuid, nombre text, sede_id uuid, estado text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.nombre, c.sede_id, c.estado
  FROM public.coaches c
  WHERE c.estado = 'activo'
    AND c.id = ANY(p_coach_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_booking_coaches(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_booking_coaches(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_coaches(uuid[]) TO service_role;