ALTER TABLE public.store_preorders
  ADD COLUMN IF NOT EXISTS sena_reminder_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sena_last_reminder_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_store_preorders_pending_reminder
  ON public.store_preorders (estado_pago_sena, estado, sena_last_reminder_at)
  WHERE estado_pago_sena = 'pendiente' AND estado IN ('pendiente_pago_sena','reservada');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='preorder-payment-reminders-daily') THEN
    PERFORM cron.unschedule('preorder-payment-reminders-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'preorder-payment-reminders-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/preorder-payment-reminders',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);