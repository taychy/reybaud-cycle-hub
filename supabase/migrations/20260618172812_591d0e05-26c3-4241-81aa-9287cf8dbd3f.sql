
-- 1) alumnos: tighten UPDATE policy to prefer user_id binding
DROP POLICY IF EXISTS "Authenticated can update own alumno" ON public.alumnos;
CREATE POLICY "Authenticated can update own alumno"
ON public.alumnos
FOR UPDATE
TO authenticated
USING (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR (user_id IS NULL AND email = auth.email())
)
WITH CHECK (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR (user_id IS NULL AND email = auth.email())
);

-- 2) cuentas_mp: column-level lockdown on secret name references
REVOKE SELECT (secret_name_token, secret_name_pubkey, secret_name_webhook)
  ON public.cuentas_mp FROM authenticated, anon;

-- 3) emisores_fiscales: column-level lockdown on private key + cert material
REVOKE SELECT (key_pem, cert_pem)
  ON public.emisores_fiscales FROM authenticated, anon;

-- 4) facturas-pdf bucket: allow students to read their own invoice files
DROP POLICY IF EXISTS "Students can read own factura PDFs" ON storage.objects;
CREATE POLICY "Students can read own factura PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'facturas-pdf'
  AND EXISTS (
    SELECT 1
    FROM public.facturas f
    JOIN public.alumnos a ON a.id = f.alumno_id
    WHERE f.pdf_path = storage.objects.name
      AND (
        (a.user_id IS NOT NULL AND a.user_id = auth.uid())
        OR (a.user_id IS NULL AND a.email = auth.email())
      )
  )
);

-- 5) mejoras_sugeridas: scoped INSERT policy forcing autor_email to match the user
CREATE POLICY "Authenticated can submit own suggestions"
ON public.mejoras_sugeridas
FOR INSERT
TO authenticated
WITH CHECK (autor_email = auth.email());
