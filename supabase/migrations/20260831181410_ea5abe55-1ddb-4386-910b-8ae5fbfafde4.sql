GRANT SELECT ON public.email_send_log TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_send_log'
      AND policyname = 'Admins can read send log'
  ) THEN
    CREATE POLICY "Admins can read send log"
      ON public.email_send_log
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at ON public.email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_message_id ON public.email_send_log (message_id);