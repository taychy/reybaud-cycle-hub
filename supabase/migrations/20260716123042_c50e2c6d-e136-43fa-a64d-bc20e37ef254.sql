CREATE POLICY "Students can view their group entrenamientos"
ON public.entrenamientos
FOR SELECT
TO authenticated
USING (
  alumno_id IS NULL
  AND visible = true
  AND grupo IN (
    SELECT alumnos.grupo FROM alumnos WHERE alumnos.user_id = auth.uid()
  )
);