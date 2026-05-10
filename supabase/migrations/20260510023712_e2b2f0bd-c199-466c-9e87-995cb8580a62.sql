-- 1) Create restricted RPC for plan capacity counts (replaces broad anon SELECT on suscripciones)
CREATE OR REPLACE FUNCTION public.get_program_inscriptions_count(p_plan_ids uuid[])
RETURNS TABLE(plan_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.plan_id, COUNT(*)::bigint
  FROM public.suscripciones s
  WHERE s.plan_id = ANY(p_plan_ids)
    AND s.estado IN ('activa','pendiente_verificacion')
  GROUP BY s.plan_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_program_inscriptions_count(uuid[]) TO anon, authenticated;

-- 2) Drop broad anon SELECT policy on suscripciones
DROP POLICY IF EXISTS "Anon can view suscripciones for capacity" ON public.suscripciones;