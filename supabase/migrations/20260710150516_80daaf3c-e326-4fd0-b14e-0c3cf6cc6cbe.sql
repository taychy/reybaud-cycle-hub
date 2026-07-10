
-- 1. Columnas nuevas en reservas_turnera
ALTER TABLE public.reservas_turnera
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS hold_expira_at timestamptz,
  ADD COLUMN IF NOT EXISTS comprobante_url text,
  ADD COLUMN IF NOT EXISTS comprobante_subido_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificado_por uuid,
  ADD COLUMN IF NOT EXISTS verificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text,
  ADD COLUMN IF NOT EXISTS upload_token uuid,
  ADD COLUMN IF NOT EXISTS email_instrucciones_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS recordatorio_15min_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_expiracion_enviado_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_turnera_metodo_pago_check') THEN
    ALTER TABLE public.reservas_turnera
      ADD CONSTRAINT reservas_turnera_metodo_pago_check
      CHECK (metodo_pago IS NULL OR metodo_pago IN ('mp','transferencia'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_reservas_turnera_hold_expira
  ON public.reservas_turnera (hold_expira_at)
  WHERE pago_estado IN ('pendiente','pendiente_mp','pendiente_transferencia');

CREATE INDEX IF NOT EXISTS idx_reservas_turnera_upload_token
  ON public.reservas_turnera (upload_token)
  WHERE upload_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservas_turnera_comprobante_pendiente
  ON public.reservas_turnera (comprobante_subido_at)
  WHERE pago_estado = 'comprobante_subido';

-- 2. Config bancaria y calendario (value es jsonb)
INSERT INTO public.app_config (key, value, description)
VALUES
  ('turnera_cbu', '""'::jsonb, 'CBU para transferencias de turnera'),
  ('turnera_alias', '""'::jsonb, 'Alias CBU para transferencias de turnera'),
  ('turnera_titular', '""'::jsonb, 'Titular de la cuenta bancaria de turnera'),
  ('turnera_cuit', '""'::jsonb, 'CUIT del titular bancario de turnera'),
  ('google_calendar_clases_id', '""'::jsonb, 'ID del Google Calendar Clases en la cuenta de Natalia')
ON CONFLICT (key) DO NOTHING;

-- 3. Cron cada 5 min
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'expire-turnera-holds';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END$$;

SELECT cron.schedule(
  'expire-turnera-holds',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/expire-turnera-holds',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncWZha2Zsb29uYnVud2tkb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDcwNjcsImV4cCI6MjA4NzUyMzA2N30.wESViBAO2oP0aTSIrgXVkIS8qJXgW4f0GtKWShHuf_o"}'::jsonb,
    body := jsonb_build_object('trigger','cron','ts', now())
  );
  $$
);
