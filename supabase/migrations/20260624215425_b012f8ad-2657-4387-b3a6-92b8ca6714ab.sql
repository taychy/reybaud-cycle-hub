
-- 1) Drop temporary audit snapshot table (sensitive, no RLS, no longer needed)
DROP TABLE IF EXISTS public._audit_suscripciones_20260624;

-- 2) Make view security_invoker (Supabase SECURITY DEFINER VIEW lint)
ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = true);

-- 3) Pin search_path on the public trigger function (function_search_path_mutable lint)
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public;

-- 4) emisores_fiscales: hide cert_pem/key_pem from any client role; expose a derived boolean
ALTER TABLE public.emisores_fiscales
  ADD COLUMN IF NOT EXISTS tiene_credenciales boolean
  GENERATED ALWAYS AS (
    cert_pem IS NOT NULL AND length(cert_pem) > 0
    AND key_pem IS NOT NULL AND length(key_pem) > 0
  ) STORED;

REVOKE SELECT ON public.emisores_fiscales FROM anon, authenticated;
GRANT SELECT (
  id, nombre_fiscal, cuit, punto_venta, activo, created_at, updated_at,
  es_predeterminado, facturacion_automatica, limite_anual_ars,
  categoria_monotributo, auto_facturar_origenes, logo_url,
  domicilio_comercial, condicion_iva, inicio_actividades,
  email_contacto, telefono_contacto, website, ingresos_brutos,
  tiene_credenciales
) ON public.emisores_fiscales TO authenticated;
-- service_role keeps full access (it's a superuser-ish role and bypasses RLS / column ACLs in practice)

-- 5) cuentas_mp: hide secret_name_* from any client role; expose derived boolean
ALTER TABLE public.cuentas_mp
  ADD COLUMN IF NOT EXISTS tiene_secrets boolean
  GENERATED ALWAYS AS (
    secret_name_token IS NOT NULL AND length(secret_name_token) > 0
  ) STORED;

REVOKE SELECT ON public.cuentas_mp FROM anon, authenticated;
GRANT SELECT (
  id, nombre, slug, emisor_fiscal_default_id, modo, activa,
  es_default_global, limite_mensual_ars, notas,
  created_at, updated_at, tiene_secrets
) ON public.cuentas_mp TO authenticated;

-- 6) Storage: restrict class-photos writes to coaches/admins
DROP POLICY IF EXISTS "Authenticated upload class-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update class-photos" ON storage.objects;

CREATE POLICY "Coaches/admins upload class-photos"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'class-photos'
    AND (
      public.has_role(auth.uid(), 'coach'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "Coaches/admins update class-photos"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'class-photos'
    AND (
      public.has_role(auth.uid(), 'coach'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'class-photos'
    AND (
      public.has_role(auth.uid(), 'coach'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- 7) Allow students to read their own MP payment intents
CREATE POLICY "Students view own payment intents"
  ON public.reservation_payment_intents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_reservations er
      JOIN public.alumnos a ON a.id = er.alumno_id
      WHERE er.id = reservation_payment_intents.reservation_id
        AND a.user_id = auth.uid()
    )
  );
