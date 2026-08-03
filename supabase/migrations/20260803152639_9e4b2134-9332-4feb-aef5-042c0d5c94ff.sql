DROP POLICY IF EXISTS "Students can create own suscripciones" ON public.suscripciones;
CREATE POLICY "Students can create own suscripciones"
ON public.suscripciones
FOR INSERT
TO authenticated
WITH CHECK (
  alumno_id IN (
    SELECT al.id FROM public.alumnos al
    WHERE al.user_id = auth.uid()
       OR (al.user_id IS NULL AND lower(al.email) = lower(auth.email()))
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);