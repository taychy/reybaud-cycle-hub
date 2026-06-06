
-- 1. alumnos: add field validation to anon/auth insert
DROP POLICY IF EXISTS "Anon can register alumnos" ON public.alumnos;
DROP POLICY IF EXISTS "Authenticated can register alumnos" ON public.alumnos;

CREATE POLICY "Anon can register alumnos"
ON public.alumnos
FOR INSERT
TO anon
WITH CHECK (
  email IS NOT NULL
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND nombre IS NOT NULL AND length(btrim(nombre)) BETWEEN 1 AND 100
  AND (apellido IS NULL OR length(apellido) <= 100)
  AND (documento IS NULL OR length(documento) <= 32)
  AND (telefono IS NULL OR length(telefono) <= 32)
);

CREATE POLICY "Authenticated can register alumnos"
ON public.alumnos
FOR INSERT
TO authenticated
WITH CHECK (
  email IS NOT NULL
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND nombre IS NOT NULL AND length(btrim(nombre)) BETWEEN 1 AND 100
);

-- 2. coaches: drop self-registration
DROP POLICY IF EXISTS "Anyone can register as coach" ON public.coaches;

-- 3. reservas_turnera: add field validation
DROP POLICY IF EXISTS "Anon can insert reservas" ON public.reservas_turnera;
DROP POLICY IF EXISTS "Authenticated can insert reservas" ON public.reservas_turnera;

CREATE POLICY "Anon can insert reservas"
ON public.reservas_turnera
FOR INSERT
TO anon
WITH CHECK (
  email IS NOT NULL
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND nombre IS NOT NULL AND length(btrim(nombre)) BETWEEN 1 AND 100
  AND apellido IS NOT NULL AND length(btrim(apellido)) BETWEEN 1 AND 100
  AND (celular IS NULL OR length(celular) <= 32)
  AND (documento IS NULL OR length(documento) <= 32)
  AND servicio_id IS NOT NULL
  AND coach_id IS NOT NULL
);

CREATE POLICY "Authenticated can insert reservas"
ON public.reservas_turnera
FOR INSERT
TO authenticated
WITH CHECK (
  email IS NOT NULL
  AND email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND nombre IS NOT NULL AND length(btrim(nombre)) BETWEEN 1 AND 100
  AND apellido IS NOT NULL AND length(btrim(apellido)) BETWEEN 1 AND 100
);

-- 4. suscripciones: require valid alumno + plan references
DROP POLICY IF EXISTS "Anon can create suscripciones" ON public.suscripciones;

CREATE POLICY "Anon can create suscripciones"
ON public.suscripciones
FOR INSERT
TO anon
WITH CHECK (
  alumno_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = suscripciones.alumno_id)
  AND plan_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.planes p WHERE p.id = suscripciones.plan_id)
);

-- 5. trip-documents: allow owners to delete their own files
DROP POLICY IF EXISTS "Students can delete own trip documents" ON storage.objects;
CREATE POLICY "Students can delete own trip documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT (alumnos.id)::text FROM alumnos WHERE alumnos.user_id = auth.uid()
  )
);

-- 6. user_roles: restrict role management to super admins
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view roles" ON public.user_roles;

CREATE POLICY "Super admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
