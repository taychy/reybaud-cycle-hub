
-- Branding columns for emisor
ALTER TABLE public.emisores_fiscales
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS domicilio_comercial TEXT,
  ADD COLUMN IF NOT EXISTS condicion_iva TEXT DEFAULT 'Monotributista',
  ADD COLUMN IF NOT EXISTS inicio_actividades DATE,
  ADD COLUMN IF NOT EXISTS email_contacto TEXT,
  ADD COLUMN IF NOT EXISTS telefono_contacto TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS ingresos_brutos TEXT;

-- PDF tracking on facturas
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_enviado_at TIMESTAMPTZ;

-- Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('emisor-logos', 'emisor-logos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas-pdf', 'facturas-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- Policies emisor-logos (public read, admin write)
DROP POLICY IF EXISTS "Public read emisor logos" ON storage.objects;
CREATE POLICY "Public read emisor logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'emisor-logos');

DROP POLICY IF EXISTS "Admins manage emisor logos" ON storage.objects;
CREATE POLICY "Admins manage emisor logos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'emisor-logos' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'emisor-logos' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Policies facturas-pdf (admin only direct access; alumnos via signed URLs from edge fn)
DROP POLICY IF EXISTS "Admins manage facturas pdf" ON storage.objects;
CREATE POLICY "Admins manage facturas pdf" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'facturas-pdf' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'facturas-pdf' AND public.has_role(auth.uid(), 'admin'::app_role));
