DROP FUNCTION IF EXISTS public.get_public_booking_coaches(uuid[]);

GRANT SELECT (id, nombre, sede_id, estado) ON public.coaches TO anon;
GRANT SELECT (id, nombre, sede_id, estado) ON public.coaches TO authenticated;