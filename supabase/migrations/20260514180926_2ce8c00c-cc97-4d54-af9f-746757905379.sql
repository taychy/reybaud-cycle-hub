ALTER TABLE public.whatsapp_check_extras
  ADD COLUMN IF NOT EXISTS alumno_id uuid,
  ADD COLUMN IF NOT EXISTS reasignar_a_grupo text,
  ADD COLUMN IF NOT EXISTS reasignado_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_wa_extras_alumno ON public.whatsapp_check_extras(alumno_id);