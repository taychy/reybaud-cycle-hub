
-- Hacer que la vista pública de coaches sea accesible sin sesión (turnera pública)
-- Solo expone id, nombre, grupos, sede_id, estado de coaches ACTIVOS (definida en el WHERE del view).
-- Cambiamos a security_invoker=false para que no herede la RLS de coaches y damos SELECT a anon/authenticated.

ALTER VIEW public.coaches_public SET (security_invoker = false);

GRANT SELECT ON public.coaches_public TO anon;
GRANT SELECT ON public.coaches_public TO authenticated;
