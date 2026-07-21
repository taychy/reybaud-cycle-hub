
-- 1) alumnos coach policy -> authenticated
DROP POLICY IF EXISTS "Coaches can view alumnos in their groups" ON public.alumnos;
CREATE POLICY "Coaches can view alumnos in their groups"
ON public.alumnos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND (grupo IN (SELECT unnest(coaches.grupos) FROM coaches WHERE coaches.user_id = auth.uid()))
);

-- 2) event_survey_responses "Users see own responses" -> authenticated + non-null email
DROP POLICY IF EXISTS "Users see own responses" ON public.event_survey_responses;
CREATE POLICY "Users see own responses"
ON public.event_survey_responses
FOR SELECT
TO authenticated
USING (
  respondent_email IS NOT NULL
  AND auth.email() IS NOT NULL
  AND lower(respondent_email) = lower(auth.email())
);

-- 3) postulaciones_asesoria admin policy -> authenticated
DROP POLICY IF EXISTS "Admins can manage postulaciones" ON public.postulaciones_asesoria;
CREATE POLICY "Admins can manage postulaciones"
ON public.postulaciones_asesoria
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4) suscripciones anon insert: add anti-spam limit (no existing pending sub for same alumno)
DROP POLICY IF EXISTS "Anon can create suscripciones" ON public.suscripciones;
CREATE POLICY "Anon can create suscripciones"
ON public.suscripciones
FOR INSERT
TO anon
WITH CHECK (
  alumno_id IS NOT NULL
  AND plan_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM alumnos a
    WHERE a.id = suscripciones.alumno_id
      AND a.user_id IS NULL
      AND COALESCE(a.profile_complete, false) = false
      AND a.created_at > (now() - interval '24 hours')
  )
  AND EXISTS (SELECT 1 FROM planes p WHERE p.id = suscripciones.plan_id)
  AND estado = 'pendiente'
  AND mp_payment_id IS NULL
  AND mp_status IS NULL
  AND mp_preapproval_id IS NULL
  AND mp_preapproval_status IS NULL
  AND COALESCE(auto_cobro_activo, false) = false
  AND COALESCE(chequeado_admin, false) = false
  AND baja_chequeada IS NOT TRUE
  -- Anti-abuse: no other pending suscripcion exists for this alumno
  AND NOT EXISTS (
    SELECT 1 FROM suscripciones s2
    WHERE s2.alumno_id = suscripciones.alumno_id
      AND s2.estado = 'pendiente'
  )
);
