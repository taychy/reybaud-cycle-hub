
-- 1) Tighten facturas SELECT: prefer user_id match, fallback to email only when user_id is null
DROP POLICY IF EXISTS "Alumnos can view their own facturas" ON public.facturas;
CREATE POLICY "Alumnos can view their own facturas"
ON public.facturas
FOR SELECT
TO authenticated
USING (
  alumno_id IN (
    SELECT a.id FROM public.alumnos a
    WHERE (a.user_id IS NOT NULL AND a.user_id = auth.uid())
       OR (a.user_id IS NULL AND lower(a.email) = lower(auth.email()))
  )
);

-- 2) Tighten anon suscripciones INSERT to safe initial values only
DROP POLICY IF EXISTS "Anon can create suscripciones" ON public.suscripciones;
CREATE POLICY "Anon can create suscripciones"
ON public.suscripciones
FOR INSERT
TO anon
WITH CHECK (
  alumno_id IS NOT NULL
  AND plan_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = suscripciones.alumno_id)
  AND EXISTS (SELECT 1 FROM public.planes p WHERE p.id = suscripciones.plan_id)
  AND estado = 'pendiente'
  AND mp_payment_id IS NULL
  AND mp_status IS NULL
  AND mp_preapproval_id IS NULL
  AND mp_preapproval_status IS NULL
  AND COALESCE(auto_cobro_activo, false) = false
  AND COALESCE(chequeado_admin, false) = false
  AND baja_chequeada IS NOT TRUE
);
