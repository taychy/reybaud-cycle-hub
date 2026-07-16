
-- 1) coaches_public: switch to security_invoker=on and add anon read policy on coaches for active coaches
DROP POLICY IF EXISTS "Anyone can view active coaches" ON public.coaches;
CREATE POLICY "Anyone can view active coaches"
ON public.coaches
FOR SELECT
TO anon, authenticated
USING (estado = 'activo');

ALTER VIEW public.coaches_public SET (security_invoker = on);

-- 2) app_config: remove blanket SELECT policy; admins/super-admins keep access via existing ALL policies
DROP POLICY IF EXISTS "app_config readable by authenticated" ON public.app_config;

-- 3) ausencias_coaches: remove open SELECT policy; add limited public SELECT and hide sensitive free-text columns
DROP POLICY IF EXISTS "Authenticated can view coach absences" ON public.ausencias_coaches;

CREATE POLICY "Public can view coach absence schedule"
ON public.ausencias_coaches
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE SELECT (motivo, creado_por) ON public.ausencias_coaches FROM anon, authenticated;
