
CREATE POLICY "Authenticated upload class-photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'class-photos');

CREATE POLICY "Authenticated read class-photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'class-photos');

CREATE POLICY "Authenticated update class-photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'class-photos');

CREATE POLICY "Admins delete class-photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'class-photos' AND public.has_role(auth.uid(), 'admin'));
