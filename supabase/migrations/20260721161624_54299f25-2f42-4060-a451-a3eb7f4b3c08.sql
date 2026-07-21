
-- Add cost fields to store_products
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS costo numeric,
  ADD COLUMN IF NOT EXISTS costo_moneda text DEFAULT 'ARS';

-- Link delivery items to store products (optional)
ALTER TABLE public.delivery_list_items
  ADD COLUMN IF NOT EXISTS store_product_id uuid REFERENCES public.store_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_list_items_store_product_id
  ON public.delivery_list_items(store_product_id);
