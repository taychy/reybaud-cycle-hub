
-- Add sku_base for short product code used in physical labels.
-- Format final del SKU por variante: RYB-{sku_base}-{abbrev variante}
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS sku_base TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS store_products_sku_base_uidx
  ON public.store_products(sku_base)
  WHERE sku_base IS NOT NULL;

-- Sequence for auto-generation (4 digits, zero-padded)
CREATE SEQUENCE IF NOT EXISTS public.store_products_sku_seq START 1;

-- Backfill existing products that don't have sku_base yet
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.store_products WHERE sku_base IS NULL ORDER BY created_at NULLS LAST, id LOOP
    UPDATE public.store_products
      SET sku_base = LPAD(nextval('public.store_products_sku_seq')::text, 4, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

-- Trigger to auto-assign sku_base on insert if not provided
CREATE OR REPLACE FUNCTION public.set_store_product_sku_base()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sku_base IS NULL OR NEW.sku_base = '' THEN
    NEW.sku_base := LPAD(nextval('public.store_products_sku_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_products_set_sku_base ON public.store_products;
CREATE TRIGGER trg_store_products_set_sku_base
  BEFORE INSERT ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.set_store_product_sku_base();
