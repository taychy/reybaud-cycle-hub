ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS aviso_camioneta_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_camioneta_enviado_por uuid,
  ADD COLUMN IF NOT EXISTS aviso_camioneta_enviado_por_email text;