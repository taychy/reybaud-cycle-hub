
ALTER TABLE public.servicios_turnera
  ADD COLUMN IF NOT EXISTS form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_confirmacion_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_recordatorio_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recordatorio_horas_antes integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS ics_adjunto boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pago_modo text NOT NULL DEFAULT 'ninguno',
  ADD COLUMN IF NOT EXISTS pago_monto_sena numeric;

ALTER TABLE public.servicios_turnera
  DROP CONSTRAINT IF EXISTS servicios_turnera_pago_modo_check;
ALTER TABLE public.servicios_turnera
  ADD CONSTRAINT servicios_turnera_pago_modo_check
  CHECK (pago_modo IN ('ninguno','sena','total'));

ALTER TABLE public.reservas_turnera
  ADD COLUMN IF NOT EXISTS form_responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pago_estado text,
  ADD COLUMN IF NOT EXISTS pago_mp_preference_id text,
  ADD COLUMN IF NOT EXISTS pago_mp_payment_id text,
  ADD COLUMN IF NOT EXISTS pago_monto numeric,
  ADD COLUMN IF NOT EXISTS recordatorio_enviado_at timestamp with time zone;
