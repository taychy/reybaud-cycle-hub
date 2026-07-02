
-- 1) Fix SECURITY DEFINER views: force security_invoker
ALTER VIEW public.v_reservation_account SET (security_invoker = true);
ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = true);

-- 2) Coaches PII: replace public policy with authenticated-only, and expose a limited public view
DROP POLICY IF EXISTS "Public can view active coaches for booking" ON public.coaches;

CREATE POLICY "Authenticated can view active coaches"
ON public.coaches
FOR SELECT
TO authenticated
USING (estado = 'activo');

CREATE OR REPLACE VIEW public.coaches_public
WITH (security_invoker = true) AS
SELECT id, nombre, grupos, sede_id, estado
FROM public.coaches
WHERE estado = 'activo';

GRANT SELECT ON public.coaches_public TO anon, authenticated;

-- 3) Ausencias coaches: restrict public read to authenticated users
DROP POLICY IF EXISTS "Lectura pública de ausencias" ON public.ausencias_coaches;

CREATE POLICY "Authenticated can view coach absences"
ON public.ausencias_coaches
FOR SELECT
TO authenticated
USING (true);
