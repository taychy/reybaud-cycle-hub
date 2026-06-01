
ALTER VIEW public.event_participants_ranking SET (security_invoker = true);
ALTER VIEW public.emisor_facturado_anual SET (security_invoker = true);
ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = true);

ALTER FUNCTION public.enqueue_email(queue_name text, payload jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(queue_name text, message_id bigint) SET search_path = public;
ALTER FUNCTION public.trg_reservation_addons_subtotal() SET search_path = public;

DROP POLICY IF EXISTS "Authenticated can upload trip documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update trip documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read trip documents" ON storage.objects;

CREATE POLICY "Students can read own trip documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.alumnos WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Students can upload own trip documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.alumnos WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Students can update own trip documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.alumnos WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.alumnos WHERE user_id = auth.uid()
  )
);
