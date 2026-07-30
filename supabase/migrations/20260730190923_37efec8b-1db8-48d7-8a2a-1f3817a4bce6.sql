CREATE OR REPLACE FUNCTION public.delivery_list_accepts_uploads(_list_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delivery_lists dl
    WHERE dl.id::text = _list_id
      AND dl.public_token IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.delivery_list_accepts_uploads(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_list_accepts_uploads(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can upload delivery payment proofs for valid lists" ON storage.objects;

CREATE POLICY "Public can upload delivery payment proofs for valid lists"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'delivery-payments'
  AND octet_length(coalesce(name, '')) < 512
  AND split_part(name, '/', 1) <> ''
  AND public.delivery_list_accepts_uploads(split_part(storage.objects.name, '/', 1))
);

DROP POLICY IF EXISTS "Admin/deposito can upload delivery payment proofs" ON storage.objects;
CREATE POLICY "Admin/deposito can upload delivery payment proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-payments'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'deposito'))
);