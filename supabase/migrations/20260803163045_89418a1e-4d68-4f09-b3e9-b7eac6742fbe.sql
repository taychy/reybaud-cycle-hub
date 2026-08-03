ALTER TABLE public.vehiculo_carga_items
  ADD COLUMN IF NOT EXISTS chequeado_at timestamptz,
  ADD COLUMN IF NOT EXISTS chequeado_by uuid;