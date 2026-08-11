CREATE OR REPLACE FUNCTION public.reparar_cancelacion_legacy_stock(p_order_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  m RECORD;
  v_rev uuid;
  v_created int := 0;
  v_skipped int := 0;
  v_total int := 0;
  v_ids jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_order FROM public.store_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pedido inexistente');
  END IF;
  IF v_order.status <> 'cancelado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'el pedido no esta cancelado');
  END IF;

  FOR m IN
    SELECT sm.*
      FROM public.stock_movements sm
     WHERE sm.order_id = p_order_id
       AND sm.tipo = 'egreso'
     ORDER BY sm.created_at
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.stock_movements r
       WHERE r.reversa_de_movimiento_id = m.id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_rev := public.adjust_store_stock(
      m.product_id,
      m.variante,
      m.cantidad,
      'Reparacion historica - devolucion por cancelacion legacy (mov ' || m.id || ')',
      p_order_id,
      p_user_id,
      m.order_item_id,
      m.id,
      false
    );
    IF v_rev IS NOT NULL THEN
      v_created := v_created + 1;
      v_total := v_total + m.cantidad;
      v_ids := v_ids || to_jsonb(v_rev);
    END IF;
  END LOOP;

  IF v_created > 0 OR v_order.stock_restored_at IS NULL THEN
    UPDATE public.store_orders
       SET stock_restored_at = COALESCE(stock_restored_at, now()),
           cancelled_at = COALESCE(cancelled_at, updated_at, now())
     WHERE id = p_order_id;
  END IF;

  IF v_created > 0 THEN
    INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
    VALUES (
      p_user_id, NULL, 'system',
      'Reparación histórica — cancelación legacy sin devolución de stock',
      'store_order', p_order_id::text,
      jsonb_build_object('reversas_creadas', v_created, 'unidades_devueltas', v_total, 'movimientos', v_ids)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'reversas_creadas', v_created, 'ya_existentes', v_skipped, 'unidades_devueltas', v_total, 'movimientos', v_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reparar_cancelacion_legacy_stock(uuid, uuid) TO service_role;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.reparar_cancelacion_legacy_stock('9583e95c-235f-4b9d-bdec-968bfb511593'::uuid, NULL);
  RAISE NOTICE 'reparacion #21: %', r;
END $$;