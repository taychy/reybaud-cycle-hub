
ALTER TABLE public.event_announcements
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_recipients_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_email_on_publish BOOLEAN NOT NULL DEFAULT false;
