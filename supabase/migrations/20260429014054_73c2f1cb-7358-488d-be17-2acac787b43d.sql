-- 1) Quitar SELECT público abierto y UPDATE por token desde la tabla
DROP POLICY IF EXISTS "Anyone can read by token" ON public.event_participants;
DROP POLICY IF EXISTS "Anyone with valid token can update own participation" ON public.event_participants;

-- 2) Permitir a un usuario autenticado leer SOLO su propia participación (por email)
CREATE POLICY "Authenticated can view own participation"
ON public.event_participants
FOR SELECT
TO authenticated
USING (lower(email) = lower(auth.email()));

-- 3) Vista pública del ranking de un evento, sin PII (sin email, sin token)
--    Sólo expone filas con resultado cargado.
CREATE OR REPLACE VIEW public.event_participants_ranking
WITH (security_invoker = on) AS
SELECT
  id,
  event_id,
  first_name,
  last_name,
  team_name,
  time_value,
  status,
  position,
  results_updated_at
FROM public.event_participants
WHERE time_value IS NOT NULL;

-- Permisos sobre la vista: cualquiera (anon o auth) puede leer el ranking ya publicado.
-- La vista usa security_invoker, por lo que se aplica RLS de la tabla base.
-- Por eso agregamos una policy explícita: lectura del ranking pública para filas con resultado.
CREATE POLICY "Anyone can view ranking rows"
ON public.event_participants
FOR SELECT
TO anon, authenticated
USING (time_value IS NOT NULL);

GRANT SELECT ON public.event_participants_ranking TO anon, authenticated;