-- Allow students to view their own invoices
CREATE POLICY "Alumnos can view their own facturas"
ON public.facturas
FOR SELECT
TO authenticated
USING (
  alumno_id IN (
    SELECT id FROM public.alumnos WHERE lower(email) = lower(auth.email())
  )
);