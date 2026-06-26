DROP POLICY IF EXISTS "Anon can insert reservas" ON public.reservas_turnera;
DROP POLICY IF EXISTS "Authenticated can insert reservas" ON public.reservas_turnera;

CREATE POLICY "Anyone can insert reservas turnera"
ON public.reservas_turnera
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(email) <= 255
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND nombre IS NOT NULL AND length(btrim(nombre)) BETWEEN 1 AND 100
  AND apellido IS NOT NULL AND length(btrim(apellido)) BETWEEN 1 AND 100
  AND (celular IS NULL OR length(celular) <= 32)
  AND (documento IS NULL OR length(documento) <= 32)
  AND servicio_id IS NOT NULL
  AND coach_id IS NOT NULL
);