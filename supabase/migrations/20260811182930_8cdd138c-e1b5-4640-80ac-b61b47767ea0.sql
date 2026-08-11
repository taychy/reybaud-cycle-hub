-- 1) Fecha de corte centralizada del control de stock
INSERT INTO public.app_config (key, value)
VALUES ('stock_control_desde', to_jsonb('2026-08-04'::text))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.stock_control_desde()
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::date FROM public.app_config WHERE key = 'stock_control_desde'),
    DATE '2026-08-04'
  );
$$;
GRANT EXECUTE ON FUNCTION public.stock_control_desde() TO authenticated, service_role, anon;

-- 2) Reparación de egresos que quedaron capados por stock insuficiente (legacy webhook)
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

  -- idempotencia
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

  -- A + B: re-ejecución contable del egreso capado y reversión del descuento fuera de ledger
  IF v_faltante > 0 THEN
    v_mov_a := public.adjust_store_stock(
      m.product_id, m.variante, -v_faltante,
      v_tag || ' Egreso del pedido que quedó capado por stock insuficiente (re-ejecución contable)',
      m.order_id, p_user_id, m.order_item_id, NULL, false);
    v_ids := v_ids || to_jsonb(v_mov_a);
  END IF;

  IF v_fantasma > 0 THEN
    v_mov_b := public.adjust_store_stock(
      m.product_id, m.variante, v_fantasma,
      v_tag || ' Reversión del doble descuento legacy del webhook (no registrado en stock_movements)',
      m.order_id, p_user_id, m.order_item_id, NULL, false);
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
GRANT EXECUTE ON FUNCTION public.reparar_egreso_capado_legacy(uuid, uuid) TO service_role;

-- 3) Detector: corte de control centralizado + exclusión de casos ya reconciliados
CREATE OR REPLACE VIEW public.vw_stock_inconsistencias AS
WITH egresos AS (
  SELECT e.*, o.order_number, o.status AS order_status
    FROM stock_movements e
    JOIN store_orders o ON o.id = e.order_id
   WHERE e.tipo = 'egreso'
), reconciliados AS (
  SELECT DISTINCT substring(r.motivo from '\[RECONCILIACION_LEGACY:([0-9a-f-]{36})\]')::uuid AS mov_id
    FROM stock_movements r
   WHERE r.motivo LIKE '%[RECONCILIACION_LEGACY:%'
)
SELECT 'PEDIDO_CANCELADO_SIN_DEVOLUCION'::text AS tipo, 'alta'::text AS severidad,
       e.order_id, e.order_number, e.product_id, e.variante,
       format('Egreso de %s sin ingreso compensatorio', e.cantidad) AS detalle
  FROM egresos e
 WHERE e.order_status = 'cancelado'
   AND NOT EXISTS (SELECT 1 FROM stock_movements rv WHERE rv.reversa_de_movimiento_id = e.id)
UNION ALL
SELECT 'PEDIDO_CON_DOBLE_EGRESO'::text, 'critica'::text,
       e.order_id, min(e.order_number), e.product_id, e.variante,
       format('%s egresos para la misma línea de pedido', count(*))
  FROM egresos e
 WHERE e.order_item_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM reconciliados rc WHERE rc.mov_id = e.id)
 GROUP BY e.order_id, e.product_id, e.variante, e.order_item_id
HAVING count(*) > 1
UNION ALL
SELECT 'PEDIDO_PAGADO_SIN_EGRESO'::text, 'alta'::text,
       o.id, o.order_number, i.product_id, NULL::text,
       format('Pedido en estado %s sin movimiento de egreso para %s', o.status, i.product_name)
  FROM store_orders o
  JOIN store_order_items i ON i.order_id = o.id AND i.product_id IS NOT NULL
 WHERE store_order_compromete_stock(o.status)
   AND COALESCE(o.pagado_at, o.created_at) >= public.stock_control_desde()
   AND NOT EXISTS (
     SELECT 1 FROM stock_movements m
      WHERE m.tipo = 'egreso' AND (m.order_item_id = i.id OR (m.order_id = o.id AND m.product_id = i.product_id)))
UNION ALL
SELECT 'STOCK_MOVIMIENTO_NO_COINCIDE'::text, 'media'::text,
       s.order_id, NULL::integer, s.product_id, s.variante,
       format('Movimiento %s: stock_anterior=%s pero el movimiento previo dejó %s', s.id, s.stock_anterior, s.prev_nuevo)
  FROM (
    SELECT m.*, lag(m.stock_nuevo) OVER (PARTITION BY m.product_id, COALESCE(m.variante,'') ORDER BY m.created_at, m.id) AS prev_nuevo
      FROM stock_movements m) s
 WHERE s.prev_nuevo IS NOT NULL AND s.prev_nuevo <> s.stock_anterior
   AND NOT EXISTS (SELECT 1 FROM reconciliados rc WHERE rc.mov_id = s.id)
UNION ALL
SELECT 'STOCK_VARIANTES_NO_COINCIDE'::text, 'media'::text,
       NULL::uuid, NULL::integer, p.id, NULL::text,
       format('stock=%s vs SUM(variant_stock)=%s', p.stock, v.suma)
  FROM store_products p
  JOIN LATERAL (SELECT sum(value::text::numeric) AS suma, count(*) AS n
                  FROM jsonb_each(COALESCE(p.variant_stock,'{}'::jsonb))) v ON true
 WHERE v.n > 0 AND COALESCE(v.suma,0) <> p.stock::numeric
UNION ALL
SELECT 'EGRESO_MAYOR_STOCK_DISPONIBLE'::text, 'alta'::text,
       m.order_id, NULL::integer, m.product_id, m.variante,
       format('Egreso de %s sobre stock %s (resultado %s)', m.cantidad, m.stock_anterior, m.stock_nuevo)
  FROM stock_movements m
 WHERE m.tipo = 'egreso' AND (m.stock_nuevo < 0 OR m.cantidad > m.stock_anterior)
   AND NOT EXISTS (SELECT 1 FROM reconciliados rc WHERE rc.mov_id = m.id);