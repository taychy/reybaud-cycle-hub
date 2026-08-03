CREATE POLICY "Deposito y admin leen etiquetas externas"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'etiquetas-externas' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)));

CREATE POLICY "Deposito y admin suben etiquetas externas"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'etiquetas-externas' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)));

CREATE POLICY "Deposito y admin actualizan etiquetas externas"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'etiquetas-externas' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)));

CREATE POLICY "Deposito y admin borran etiquetas externas"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'etiquetas-externas' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)));