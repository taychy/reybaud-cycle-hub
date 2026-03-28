
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'suscripcion',
  ADD COLUMN IF NOT EXISTS precio_promocional numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cuotas_cantidad integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cuota_valor numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_inscripciones integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS imagen_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inscripciones_actuales integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.planes.tipo IS 'suscripcion or programa';
