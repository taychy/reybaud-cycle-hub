-- Quitar la policy que filtraba por filas pero exponía todas las columnas (incluido email y token)
DROP POLICY IF EXISTS "Anyone can view ranking rows" ON public.event_participants;

-- Recrear la vista de ranking en modo SECURITY DEFINER (sin security_invoker)
-- para que pueda leer la tabla base sin requerir RLS del invocador.
DROP VIEW IF EXISTS public.event_participants_ranking;

CREATE VIEW public.event_participants_ranking AS
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

-- Permisos: la vista expone sólo columnas seguras del ranking
GRANT SELECT ON public.event_participants_ranking TO anon, authenticated;