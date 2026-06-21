
-- =========================================================
-- Security hardening: restrict sensitive columns, tighten policies
-- =========================================================

-- 1) cuentas_mp: hide secret_name_* from authenticated SELECT (only service_role can read)
REVOKE SELECT (secret_name_token, secret_name_webhook, secret_name_pubkey)
  ON public.cuentas_mp FROM authenticated;
REVOKE SELECT (secret_name_token, secret_name_webhook, secret_name_pubkey)
  ON public.cuentas_mp FROM anon;

-- 2) emisores_fiscales: hide private key + cert from authenticated SELECT
REVOKE SELECT (key_pem, cert_pem)
  ON public.emisores_fiscales FROM authenticated;
REVOKE SELECT (key_pem, cert_pem)
  ON public.emisores_fiscales FROM anon;

-- 3) event_participants: hide public_access_token columns from authenticated SELECT
--    (only service_role / edge functions need it; sharing is via token URL)
REVOKE SELECT (public_access_token, token_expires_at)
  ON public.event_participants FROM authenticated;
REVOKE SELECT (public_access_token, token_expires_at)
  ON public.event_participants FROM anon;

-- 4) suscripciones: prevent students from overwriting financial / status fields.
--    Keep the existing "Students can update own suscripciones" policy (used by
--    MP flows to attach mp_payment_id/mp_status), but enforce immutability of
--    sensitive columns through a trigger that allows admins / service_role to bypass.
CREATE OR REPLACE FUNCTION public.guard_suscripcion_student_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypass (edge functions)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- admins bypass
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admin students: block changes to financial/status columns
  IF NEW.estado            IS DISTINCT FROM OLD.estado            OR
     NEW.precio_base       IS DISTINCT FROM OLD.precio_base       OR
     NEW.precio_final      IS DISTINCT FROM OLD.precio_final      OR
     NEW.descuento_id      IS DISTINCT FROM OLD.descuento_id      OR
     NEW.plan_id           IS DISTINCT FROM OLD.plan_id           OR
     NEW.alumno_id         IS DISTINCT FROM OLD.alumno_id         OR
     NEW.fecha_inicio      IS DISTINCT FROM OLD.fecha_inicio      OR
     NEW.fecha_fin         IS DISTINCT FROM OLD.fecha_fin         OR
     COALESCE(NEW.auto_cobro_activo,false) IS DISTINCT FROM COALESCE(OLD.auto_cobro_activo,false) OR
     COALESCE(NEW.chequeado_admin,false)   IS DISTINCT FROM COALESCE(OLD.chequeado_admin,false)   OR
     COALESCE(NEW.baja_chequeada,false)    IS DISTINCT FROM COALESCE(OLD.baja_chequeada,false)
  THEN
    RAISE EXCEPTION 'No autorizado para modificar campos restringidos de la suscripción';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_suscripcion_student_update ON public.suscripciones;
CREATE TRIGGER trg_guard_suscripcion_student_update
  BEFORE UPDATE ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.guard_suscripcion_student_update();

-- 5) anon_suscripciones_insert: tighten the policy so anon can only create
--    pending subs for alumnos that are still in the public registration window
--    (no user_id linked yet AND profile not completed).
DROP POLICY IF EXISTS "Anon can create suscripciones" ON public.suscripciones;
CREATE POLICY "Anon can create suscripciones"
  ON public.suscripciones
  FOR INSERT
  TO anon
  WITH CHECK (
    alumno_id IS NOT NULL AND plan_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.alumnos a
      WHERE a.id = suscripciones.alumno_id
        AND a.user_id IS NULL
        AND COALESCE(a.profile_complete, false) = false
        AND a.created_at > (now() - interval '24 hours')
    )
    AND EXISTS (SELECT 1 FROM public.planes p WHERE p.id = suscripciones.plan_id)
    AND estado = 'pendiente'
    AND mp_payment_id IS NULL
    AND mp_status IS NULL
    AND mp_preapproval_id IS NULL
    AND mp_preapproval_status IS NULL
    AND COALESCE(auto_cobro_activo, false) = false
    AND COALESCE(chequeado_admin, false) = false
    AND baja_chequeada IS NOT TRUE
  );

-- 6) mejoras_sugeridas: remove from realtime publication so non-admins
--    can't subscribe and receive others' submissions live.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mejoras_sugeridas'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.mejoras_sugeridas';
  END IF;
END $$;
