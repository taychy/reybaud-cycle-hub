
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS provincia text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono text,
  ADD COLUMN IF NOT EXISTS condicion_medica text,
  ADD COLUMN IF NOT EXISTS como_se_entero text,
  ADD COLUMN IF NOT EXISTS profile_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'active';
