ALTER TABLE public.servicios_turnera
ADD COLUMN IF NOT EXISTS email_coach_enabled boolean NOT NULL DEFAULT true;