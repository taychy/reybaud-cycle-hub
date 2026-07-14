CREATE POLICY "Anyone can view active coaches for booking"
ON public.coaches
FOR SELECT
TO anon
USING (estado = 'activo');