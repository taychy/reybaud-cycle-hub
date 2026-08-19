DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-intents')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-intents-5min') THEN
    PERFORM cron.unschedule('expire-stale-intents-5min');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-admin-notifications')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-admin-notifications-1min') THEN
    PERFORM cron.unschedule('process-admin-notifications-1min');
  END IF;
END $$;