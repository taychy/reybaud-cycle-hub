
ALTER TABLE public.event_surveys
  ADD COLUMN IF NOT EXISTS fecha_limite_respuesta timestamptz,
  ADD COLUMN IF NOT EXISTS descuento_activo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descuento_porcentaje int,
  ADD COLUMN IF NOT EXISTS descuento_titulo text,
  ADD COLUMN IF NOT EXISTS descuento_mensaje text,
  ADD COLUMN IF NOT EXISTS descuento_cta_label text,
  ADD COLUMN IF NOT EXISTS descuento_url text;
