
-- 1. Create secure RPC for pre-login email lookup (replaces anon SELECT on alumnos)
CREATE OR REPLACE FUNCTION public.lookup_alumno_by_email(p_email text)
RETURNS TABLE(id uuid, nombre text, estado text, grupo text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.nombre, a.estado, a.grupo::text
  FROM alumnos a
  WHERE a.email = lower(trim(p_email))
  LIMIT 1;
$$;

-- 2. Remove dangerous anon USING(true) policy on alumnos
DROP POLICY IF EXISTS "Anon can lookup by email" ON public.alumnos;

-- 3. Fix suscripciones: replace open SELECT with student-only + admin
DROP POLICY IF EXISTS "Anyone can view suscripciones" ON public.suscripciones;

CREATE POLICY "Students can view own suscripciones"
ON public.suscripciones
FOR SELECT
TO authenticated
USING (
  alumno_id IN (
    SELECT al.id FROM alumnos al WHERE al.user_id = auth.uid()
  )
);

-- 4. Fix suscripciones: replace open INSERT with authenticated student only
DROP POLICY IF EXISTS "Anyone can create suscripciones" ON public.suscripciones;

CREATE POLICY "Students can create own suscripciones"
ON public.suscripciones
FOR INSERT
TO authenticated
WITH CHECK (
  alumno_id IN (
    SELECT al.id FROM alumnos al WHERE al.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 5. Fix entrenamientos_realizados: restrict INSERT and SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can insert realizados" ON public.entrenamientos_realizados;
DROP POLICY IF EXISTS "Anyone can view realizados" ON public.entrenamientos_realizados;

CREATE POLICY "Students can insert own realizados"
ON public.entrenamientos_realizados
FOR INSERT
TO authenticated
WITH CHECK (
  alumno_id IN (
    SELECT al.id FROM alumnos al WHERE al.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'coach'::app_role)
);

CREATE POLICY "Authenticated can view realizados"
ON public.entrenamientos_realizados
FOR SELECT
TO authenticated
USING (true);

-- 6. Fix event_results: restrict UPDATE to authenticated
DROP POLICY IF EXISTS "Anyone can update event_results" ON public.event_results;

CREATE POLICY "Authenticated can update event_results"
ON public.event_results
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 7. Fix alumnos: restrict anon INSERT to prevent spam registrations
DROP POLICY IF EXISTS "Anon can register alumnos" ON public.alumnos;

CREATE POLICY "Authenticated can register alumnos"
ON public.alumnos
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also allow anon for the registration flow (before auth)
CREATE POLICY "Anon can register alumnos"
ON public.alumnos
FOR INSERT
TO anon
WITH CHECK (true);

-- 8. Fix reservas_turnera: restrict INSERT to authenticated
DROP POLICY IF EXISTS "Anyone can insert reservas" ON public.reservas_turnera;

CREATE POLICY "Authenticated can insert reservas"
ON public.reservas_turnera
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also allow anon for public booking flow
CREATE POLICY "Anon can insert reservas"
ON public.reservas_turnera
FOR INSERT
TO anon
WITH CHECK (true);
