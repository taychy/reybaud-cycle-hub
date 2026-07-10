
DROP POLICY IF EXISTS "turnera_comprobantes_admin_select" ON storage.objects;
CREATE POLICY "turnera_comprobantes_admin_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'turnera-comprobantes'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);
