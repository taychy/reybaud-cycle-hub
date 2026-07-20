
DROP POLICY IF EXISTS "Anyone can view active coaches" ON public.coaches;

DROP POLICY IF EXISTS "Anyone can upload delivery payment proofs" ON storage.objects;

CREATE POLICY "Public can upload delivery payment proofs for valid lists"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'delivery-payments'
  AND octet_length(coalesce(name, '')) < 512
  AND split_part(name, '/', 1) <> ''
  AND EXISTS (
    SELECT 1 FROM public.delivery_lists dl
    WHERE dl.id::text = split_part(storage.objects.name, '/', 1)
      AND dl.public_token IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Anyone can create waitlist request" ON public.event_accommodation_waitlist_requests;

CREATE POLICY "Anyone can create waitlist request"
ON public.event_accommodation_waitlist_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_id IS NOT NULL
  AND (prospect_nombre IS NULL OR length(btrim(prospect_nombre)) BETWEEN 1 AND 120)
  AND (prospect_telefono IS NULL OR length(prospect_telefono) <= 40)
  AND (nota_alumno IS NULL OR length(nota_alumno) <= 2000)
  AND (
    prospect_email IS NULL
    OR (
      length(prospect_email) <= 255
      AND prospect_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    )
  )
);
