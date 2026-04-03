
-- Add medical certificate columns to alumnos table
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS medical_certificate_url text,
  ADD COLUMN IF NOT EXISTS medical_certificate_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS medical_certificate_expiration_date date,
  ADD COLUMN IF NOT EXISTS medical_certificate_status text NOT NULL DEFAULT 'no_cargado',
  ADD COLUMN IF NOT EXISTS medical_certificate_requested_at timestamptz;

-- Create storage bucket for medical certificates
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-certificates', 'medical-certificates', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for medical-certificates bucket
CREATE POLICY "Admins can manage medical certificates"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'medical-certificates' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'medical-certificates' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can upload own medical certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medical-certificates' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM alumnos WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Students can view own medical certificates"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'medical-certificates' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM alumnos WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Students can update own medical certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'medical-certificates' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM alumnos WHERE user_id = auth.uid()
  )
);
