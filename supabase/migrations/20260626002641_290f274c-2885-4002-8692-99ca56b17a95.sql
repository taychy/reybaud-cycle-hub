-- Permite a la página pública de turnera leer datos mínimos de coaches activos
-- (nombre + sede) para mostrar el listado en la reserva externa.
CREATE POLICY "Public can view active coaches for booking"
ON public.coaches
FOR SELECT
TO anon, authenticated
USING (estado = 'activo');

GRANT SELECT ON public.coaches TO anon;