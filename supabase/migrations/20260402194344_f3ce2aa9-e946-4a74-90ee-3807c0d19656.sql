
-- Students can update own suscripciones (e.g. toggle auto_renovacion, cancel)
CREATE POLICY "Students can update own suscripciones"
ON public.suscripciones
FOR UPDATE
TO authenticated
USING (
  alumno_id IN (
    SELECT al.id FROM alumnos al WHERE al.user_id = auth.uid()
  )
)
WITH CHECK (
  alumno_id IN (
    SELECT al.id FROM alumnos al WHERE al.user_id = auth.uid()
  )
);

-- Allow anon INSERT for registration flow (before user is authenticated)
CREATE POLICY "Anon can create suscripciones"
ON public.suscripciones
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon SELECT for plan selection flow (checking program capacity)
CREATE POLICY "Anon can view suscripciones for capacity"
ON public.suscripciones
FOR SELECT
TO anon
USING (true);
