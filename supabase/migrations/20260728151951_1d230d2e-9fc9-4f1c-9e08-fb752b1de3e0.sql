CREATE OR REPLACE FUNCTION public.sync_store_product_stock_from_variants()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sum numeric;
BEGIN
  IF NEW.variant_stock IS NOT NULL AND jsonb_typeof(NEW.variant_stock::jsonb) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(NEW.variant_stock::jsonb)) > 0 THEN
    SELECT COALESCE(SUM(COALESCE((value)::text::numeric, 0)), 0)
      INTO v_sum
      FROM jsonb_each(NEW.variant_stock::jsonb);
    NEW.stock := GREATEST(0, FLOOR(v_sum))::int;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_product_stock ON public.store_products;
CREATE TRIGGER trg_sync_store_product_stock
BEFORE INSERT OR UPDATE OF variant_stock ON public.store_products
FOR EACH ROW EXECUTE FUNCTION public.sync_store_product_stock_from_variants();

-- Backfill: alinear el total con la suma de variantes donde difieren
UPDATE public.store_products p
SET stock = s.total
FROM (
  SELECT id, GREATEST(0, FLOOR(COALESCE(SUM(COALESCE((value)::text::numeric,0)),0)))::int AS total
  FROM public.store_products, LATERAL jsonb_each(variant_stock::jsonb)
  WHERE variant_stock IS NOT NULL AND jsonb_typeof(variant_stock::jsonb) = 'object'
  GROUP BY id
) s
WHERE p.id = s.id AND p.stock IS DISTINCT FROM s.total;