DROP TRIGGER IF EXISTS trg_sync_store_product_stock ON public.store_products;

CREATE TRIGGER trg_sync_store_product_stock
BEFORE INSERT OR UPDATE ON public.store_products
FOR EACH ROW EXECUTE FUNCTION public.sync_store_product_stock_from_variants();

-- Realinear cualquier producto desincronizado hoy
UPDATE public.store_products p
SET stock = GREATEST(0, FLOOR(s.suma))::int
FROM (
  SELECT id, COALESCE(SUM(COALESCE((value)::text::numeric, 0)), 0) AS suma
  FROM public.store_products, LATERAL jsonb_each(COALESCE(variant_stock, '{}'::jsonb))
  GROUP BY id
) s
WHERE p.id = s.id AND p.stock IS DISTINCT FROM GREATEST(0, FLOOR(s.suma))::int;