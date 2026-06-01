ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS chequeado_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chequeado_admin_at timestamptz,
  ADD COLUMN IF NOT EXISTS chequeado_admin_by uuid,
  ADD COLUMN IF NOT EXISTS baja_nota text,
  ADD COLUMN IF NOT EXISTS baja_chequeada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS baja_chequeada_at timestamptz,
  ADD COLUMN IF NOT EXISTS baja_chequeada_by uuid;

CREATE INDEX IF NOT EXISTS idx_suscripciones_chequeado_pendiente
  ON public.suscripciones (created_at)
  WHERE chequeado_admin = false;

CREATE INDEX IF NOT EXISTS idx_suscripciones_baja_pendiente
  ON public.suscripciones (fecha_fin)
  WHERE baja_chequeada = false AND estado IN ('vencida','cancelada');