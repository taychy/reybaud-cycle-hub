DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-admin-notifications-1min') THEN
    PERFORM cron.unschedule('process-admin-notifications-1min');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='expire-stale-intents-5min') THEN
    PERFORM cron.unschedule('expire-stale-intents-5min');
  END IF;
END $$;

SELECT cron.schedule(
  'process-admin-notifications-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/process-admin-notifications',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'expire-stale-intents-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/expire-stale-intents',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);