
CREATE POLICY "Students can update own event_reservations"
ON public.event_reservations
FOR UPDATE
TO authenticated
USING (
  alumno_id IN (
    SELECT alumnos.id FROM alumnos WHERE alumnos.user_id = auth.uid()
  )
)
WITH CHECK (
  alumno_id IN (
    SELECT alumnos.id FROM alumnos WHERE alumnos.user_id = auth.uid()
  )
);
