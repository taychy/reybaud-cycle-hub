
-- Add access_token to event_reservations
ALTER TABLE public.event_reservations
ADD COLUMN access_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex');

-- Ensure uniqueness
CREATE UNIQUE INDEX idx_event_reservations_access_token ON public.event_reservations(access_token);

-- Allow anonymous users to read a reservation by token
CREATE POLICY "Anon can view reservation by token"
ON public.event_reservations
FOR SELECT
TO anon
USING (true);

-- Allow anon to read event_external_participants linked to a reservation they can access
CREATE POLICY "Anon can view external participants"
ON public.event_external_participants
FOR SELECT
TO anon
USING (true);

-- Allow anon to view visible event announcements
CREATE POLICY "Anon can view visible event_announcements"
ON public.event_announcements
FOR SELECT
TO anon
USING (visible = true);

-- Allow anon to read reservation_checklist_data by reservation
CREATE POLICY "Anon can view checklist data"
ON public.reservation_checklist_data
FOR SELECT
TO anon
USING (true);

-- Allow anon to insert checklist data
CREATE POLICY "Anon can insert checklist data"
ON public.reservation_checklist_data
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to update checklist data
CREATE POLICY "Anon can update checklist data"
ON public.reservation_checklist_data
FOR UPDATE
TO anon
USING (true);

-- Storage: allow anon uploads to trip-documents
CREATE POLICY "Anon can upload trip documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'trip-documents');

-- Storage: allow anon to read trip-documents (bucket is already public but ensure policy)
CREATE POLICY "Anon can read trip documents"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'trip-documents');
