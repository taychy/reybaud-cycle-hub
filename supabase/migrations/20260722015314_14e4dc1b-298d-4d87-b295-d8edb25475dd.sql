ALTER TABLE public.servicios_turnera
  ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_servicios_turnera_archivado
  ON public.servicios_turnera (archivado);