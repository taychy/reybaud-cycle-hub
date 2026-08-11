CREATE TABLE IF NOT EXISTS public.qa_stock_test_results (
  id bigserial PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  test integer NOT NULL,
  estado text NOT NULL,
  nombre text,
  detalle text
);
GRANT SELECT ON public.qa_stock_test_results TO authenticated;
GRANT ALL ON public.qa_stock_test_results TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.qa_stock_test_results_id_seq TO service_role;
ALTER TABLE public.qa_stock_test_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qa stock results admin read" ON public.qa_stock_test_results;
CREATE POLICY "qa stock results admin read" ON public.qa_stock_test_results
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.reparar_egreso_capado_legacy(p_movement_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  m RECORD;
  v_prev int;
  v_stock_actual int;
  v_aplicado int;
  v_faltante int;
  v_fantasma int;
  v_tag text;
  v_mov_a uuid; v_mov_b uuid;
  v_ids jsonb := '[]'::jsonb;
  v_final int;
BEGIN
  SELECT sm.* INTO m FROM public.stock_movements sm WHERE sm.id = p_movement_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'movimiento inexistente'); END IF;
  IF m.tipo <> 'egreso' THEN RETURN jsonb_build_object('ok', false, 'error', 'el movimiento no es un egreso'); END IF;

  v_tag := '[RECONCILIACION_LEGACY:' || m.id || ']';

  IF EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.motivo LIKE '%' || v_tag || '%') THEN
    SELECT COALESCE(stock,0) INTO v_final FROM public.store_products WHERE id = m.product_id;
    RETURN jsonb_build_object('ok', true, 'ya_aplicada', true, 'stock_final', v_final);
  END IF;

  PERFORM 1 FROM public.store_products WHERE id = m.product_id FOR UPDATE;
  SELECT COALESCE(stock,0) INTO v_stock_actual FROM public.store_products WHERE id = m.product_id;

  SELECT x.prev_nuevo INTO v_prev FROM (
    SELECT s.id, lag(s.stock_nuevo) OVER (PARTITION BY s.product_id, COALESCE(s.variante,'') ORDER BY s.created_at, s.id) AS prev_nuevo
      FROM public.stock_movements s WHERE s.product_id = m.product_id
  ) x WHERE x.id = m.id;

  v_aplicado := GREATEST(COALESCE(m.stock_anterior,0) - COALESCE(m.stock_nuevo,0), 0);
  v_faltante := GREATEST(m.cantidad - v_aplicado, 0);
  v_fantasma := GREATEST(COALESCE(v_prev, m.stock_anterior) - COALESCE(m.stock_anterior,0), 0);

  IF v_faltante = 0 AND v_fantasma = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'el movimiento no presenta capado ni descuento fantasma');
  END IF;

  IF v_faltante > 0 THEN
    v_mov_a := public.adjust_store_stock(
      m.product_id, m.variante, -v_faltante,
      v_tag || ' Egreso del pedido que quedó capado por stock insuficiente (re-ejecución contable)',
      m.order_id, p_user_id, NULL, NULL, false);
    v_ids := v_ids || to_jsonb(v_mov_a);
  END IF;

  IF v_fantasma > 0 THEN
    v_mov_b := public.adjust_store_stock(
      m.product_id, m.variante, v_fantasma,
      v_tag || ' Reversión del doble descuento legacy del webhook (no registrado en stock_movements)',
      m.order_id, p_user_id, NULL, NULL, false);
    v_ids := v_ids || to_jsonb(v_mov_b);
  END IF;

  SELECT COALESCE(stock,0) INTO v_final FROM public.store_products WHERE id = m.product_id;

  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (p_user_id, NULL, 'system',
    'Reparación histórica — egreso capado por stock insuficiente (doble descuento legacy)',
    'stock_movement', m.id::text,
    jsonb_build_object(
      'product_id', m.product_id, 'order_id', m.order_id,
      'stock_previo_reparacion', v_stock_actual, 'stock_final', v_final,
      'unidades_faltantes_egreso', v_faltante, 'unidades_descuento_fantasma', v_fantasma,
      'movimientos', v_ids));

  RETURN jsonb_build_object('ok', true, 'ya_aplicada', false,
    'stock_previo', v_stock_actual, 'stock_final', v_final,
    'egreso_reejecutado', v_faltante, 'ingreso_reversion_fantasma', v_fantasma,
    'movimientos', v_ids);
END $fn$;

SELECT public.reparar_egreso_capado_legacy('8e4588ad-516d-4f60-ada0-11cb052b9db9'::uuid, NULL);
-- verificación de idempotencia (segunda ejecución no debe crear movimientos)
SELECT public.reparar_egreso_capado_legacy('8e4588ad-516d-4f60-ada0-11cb052b9db9'::uuid, NULL);

DELETE FROM public.qa_stock_test_results;
INSERT INTO public.qa_stock_test_results (test, estado, nombre, detalle)
SELECT t.test, t.estado, t.nombre, t.detalle FROM public.run_store_stock_tests() t;