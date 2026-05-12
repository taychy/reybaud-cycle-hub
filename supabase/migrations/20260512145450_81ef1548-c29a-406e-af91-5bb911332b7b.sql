
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS pause_motivo text,
  ADD COLUMN IF NOT EXISTS pause_fecha_estimada_retorno date,
  ADD COLUMN IF NOT EXISTS pause_proximo_followup date,
  ADD COLUMN IF NOT EXISTS pause_ultimo_contacto_at timestamptz;
