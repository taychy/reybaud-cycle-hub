CREATE POLICY "Anon can register alumnos"
ON public.alumnos
FOR INSERT
WITH CHECK (true);