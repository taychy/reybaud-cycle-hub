-- Allow authenticated users to read their own alumno record by email
CREATE POLICY "Authenticated can view own alumno"
ON public.alumnos
FOR SELECT
TO authenticated
USING (email = auth.email());

-- Allow authenticated users to update their own alumno record (for setting user_id)
CREATE POLICY "Authenticated can update own alumno"
ON public.alumnos
FOR UPDATE
TO authenticated
USING (email = auth.email())
WITH CHECK (email = auth.email());