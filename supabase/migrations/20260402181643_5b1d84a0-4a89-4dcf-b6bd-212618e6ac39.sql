
-- Add vigencia fields to descuentos
ALTER TABLE public.descuentos ADD COLUMN IF NOT EXISTS vigencia_desde date DEFAULT NULL;
ALTER TABLE public.descuentos ADD COLUMN IF NOT EXISTS vigencia_hasta date DEFAULT NULL;

-- Add discount tracking fields to suscripciones
ALTER TABLE public.suscripciones ADD COLUMN IF NOT EXISTS descuento_id uuid REFERENCES public.descuentos(id) DEFAULT NULL;
ALTER TABLE public.suscripciones ADD COLUMN IF NOT EXISTS precio_base numeric DEFAULT NULL;
ALTER TABLE public.suscripciones ADD COLUMN IF NOT EXISTS precio_final numeric DEFAULT NULL;
