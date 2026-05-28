
-- Productos: métodos de entrega habilitados + sedes de retiro
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS delivery_methods jsonb NOT NULL DEFAULT '["retiro_sede"]'::jsonb,
  ADD COLUMN IF NOT EXISTS pickup_sede_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- Preventas: datos de entrega elegidos por el cliente
ALTER TABLE public.store_preorders
  ADD COLUMN IF NOT EXISTS entrega_metodo text,                  -- 'retiro_sede' | 'envio_moto'
  ADD COLUMN IF NOT EXISTS sede_retiro_id uuid REFERENCES public.sedes(id),
  ADD COLUMN IF NOT EXISTS envio_direccion text,
  ADD COLUMN IF NOT EXISTS envio_contacto text,
  ADD COLUMN IF NOT EXISTS envio_notas text,
  ADD COLUMN IF NOT EXISTS envio_costo numeric,                  -- nullable: se cotiza luego
  ADD COLUMN IF NOT EXISTS envio_estado text DEFAULT 'a_cotizar'; -- a_cotizar|cotizado|pagado|enviado|entregado

CREATE INDEX IF NOT EXISTS idx_store_preorders_sede_retiro ON public.store_preorders(sede_retiro_id);
CREATE INDEX IF NOT EXISTS idx_store_preorders_entrega_metodo ON public.store_preorders(entrega_metodo);
