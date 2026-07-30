ALTER TABLE public.marketing_contacts ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS google_resource_name text,
  ADD COLUMN IF NOT EXISTS google_etag text,
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_sync_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_sync_error text,
  ADD COLUMN IF NOT EXISTS agenda_estado text;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_google_resource_uq
  ON public.marketing_contacts (google_resource_name)
  WHERE google_resource_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_google_pending
  ON public.marketing_contacts (google_sync_pending)
  WHERE google_sync_pending;