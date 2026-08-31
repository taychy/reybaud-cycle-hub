ALTER TABLE public.agenda_grupal
  ADD COLUMN IF NOT EXISTS vigente_desde date,
  ADD COLUMN IF NOT EXISTS vigente_hasta date;