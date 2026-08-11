CREATE TABLE IF NOT EXISTS public._tmp_repair_check(k text, v jsonb);
TRUNCATE public._tmp_repair_check;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.reparar_cancelacion_legacy_stock('9583e95c-235f-4b9d-bdec-968bfb511593'::uuid, NULL);
  INSERT INTO public._tmp_repair_check VALUES ('segunda_ejecucion', r);
  INSERT INTO public._tmp_repair_check
    SELECT 'stock_post', to_jsonb(stock) FROM public.store_products WHERE id='8b937627-228b-401c-9297-613974e29718';
  INSERT INTO public._tmp_repair_check
    SELECT 'movimientos_producto', to_jsonb(count(*)) FROM public.stock_movements WHERE product_id='8b937627-228b-401c-9297-613974e29718';
  INSERT INTO public._tmp_repair_check
    SELECT 'tests', jsonb_agg(to_jsonb(t)) FROM public.run_store_stock_tests() t;
END $$;

GRANT SELECT ON public._tmp_repair_check TO service_role;