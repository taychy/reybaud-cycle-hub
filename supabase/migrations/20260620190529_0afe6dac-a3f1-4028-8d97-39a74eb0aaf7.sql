
ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS terminos_aceptados_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS terminos_version_aceptada TEXT,
  ADD COLUMN IF NOT EXISTS terminos_snapshot JSONB;
