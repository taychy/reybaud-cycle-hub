
DROP POLICY IF EXISTS "Authenticated users can insert audit_log" ON public.audit_log;
CREATE POLICY "Admins can insert audit_log"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Anyone can check in to events" ON public.event_participants;

DROP POLICY IF EXISTS "Anyone can create postulaciones" ON public.postulaciones_asesoria;
CREATE POLICY "Anyone can create postulaciones"
ON public.postulaciones_asesoria
FOR INSERT
TO public
WITH CHECK (
  nombre_completo IS NOT NULL AND char_length(btrim(nombre_completo)) BETWEEN 2 AND 120
  AND email IS NOT NULL AND char_length(email) BETWEEN 5 AND 200
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND whatsapp IS NOT NULL AND char_length(btrim(whatsapp)) BETWEEN 6 AND 30
  AND (tipo_asesoria IS NULL OR char_length(tipo_asesoria) <= 60)
  AND (descripcion IS NULL OR char_length(descripcion) <= 2000)
);
