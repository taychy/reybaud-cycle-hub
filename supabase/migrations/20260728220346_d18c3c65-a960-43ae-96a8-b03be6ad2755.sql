ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS es_externo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proveedor text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS precio_oficial numeric,
  ADD COLUMN IF NOT EXISTS descuento_pct numeric DEFAULT 15,
  ADD COLUMN IF NOT EXISTS entrega_estimada_dias integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS promo_activa boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_store_products_promo ON public.store_products (promo_activa) WHERE promo_activa;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS promo_product_ids uuid[] NOT NULL DEFAULT '{}';