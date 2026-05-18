
-- 1. entrenamientos_realizados: replace permissive SELECT
DROP POLICY IF EXISTS "Authenticated can view realizados" ON public.entrenamientos_realizados;

CREATE POLICY "Students view own realizados"
ON public.entrenamientos_realizados
FOR SELECT
TO authenticated
USING (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'coach'::app_role)
);

-- 2. event_results: lock down public/authenticated blanket policies
DROP POLICY IF EXISTS "Anyone can insert event_results" ON public.event_results;
DROP POLICY IF EXISTS "Anyone can read event_results" ON public.event_results;
DROP POLICY IF EXISTS "Authenticated can update event_results" ON public.event_results;

CREATE POLICY "Read event_results (self, admin, coach)"
ON public.event_results
FOR SELECT
TO authenticated
USING (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'coach'::app_role)
);

CREATE POLICY "Insert own event_results"
ON public.event_results
FOR INSERT
TO authenticated
WITH CHECK (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'coach'::app_role)
);

CREATE POLICY "Update own event_results"
ON public.event_results
FOR UPDATE
TO authenticated
USING (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'coach'::app_role)
)
WITH CHECK (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'coach'::app_role)
);

-- 3. trip-documents storage bucket: remove anon insert/update; keep authenticated path-scoped
DROP POLICY IF EXISTS "Anon can upload trip documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon can read trip documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view trip documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own trip documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload trip documents" ON storage.objects;

CREATE POLICY "Authenticated can upload trip documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'trip-documents');

CREATE POLICY "Authenticated can update trip documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'trip-documents')
WITH CHECK (bucket_id = 'trip-documents');

CREATE POLICY "Authenticated can read trip documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'trip-documents');

CREATE POLICY "Admins can manage trip documents"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'trip-documents' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'trip-documents' AND public.has_role(auth.uid(), 'admin'::app_role));
