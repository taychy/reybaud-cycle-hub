ALTER TABLE public.servicios_turnera
ADD COLUMN IF NOT EXISTS anticipacion_horas_minima integer NOT NULL DEFAULT 24;