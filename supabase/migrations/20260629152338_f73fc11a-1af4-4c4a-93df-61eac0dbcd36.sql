ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS entrega_metodo text,
  ADD COLUMN IF NOT EXISTS sede_retiro_id uuid REFERENCES public.sedes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS envio_direccion text,
  ADD COLUMN IF NOT EXISTS envio_contacto text,
  ADD COLUMN IF NOT EXISTS envio_notas text,
  ADD COLUMN IF NOT EXISTS envio_costo numeric,
  ADD COLUMN IF NOT EXISTS envio_estado text;