DROP POLICY IF EXISTS "Authenticated can view active coaches" ON public.coaches;
DROP POLICY IF EXISTS "Public can view active coaches" ON public.coaches;

CREATE POLICY "Staff can view active coaches"
ON public.coaches
FOR SELECT
TO authenticated
USING (estado = 'activo' AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin')));

CREATE OR REPLACE FUNCTION public.get_coaches_public()
RETURNS TABLE (id uuid, nombre text, grupos text[], sede_id uuid, estado text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.nombre, c.grupos, c.sede_id, c.estado
  FROM public.coaches c
  WHERE c.estado = 'activo';
$$;

GRANT EXECUTE ON FUNCTION public.get_coaches_public() TO anon, authenticated;

ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = on);