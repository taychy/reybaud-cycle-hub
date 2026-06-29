ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz;

CREATE OR REPLACE FUNCTION public.cancel_store_order(_order_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_item RECORD;
  v_stock_actual integer;
  v_variant_key text;
  v_variant_stock jsonb;
  v_current_variant_qty integer;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_order FROM public.store_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado';
  END IF;
  IF v_order.status = 'cancelado' THEN
    RAISE EXCEPTION 'El pedido ya está cancelado';
  END IF;

  -- Restaurar stock por cada item con product_id
  FOR v_item IN
    SELECT id, product_id, product_name, quantity, variant_selection
    FROM public.store_order_items
    WHERE order_id = _order_id AND product_id IS NOT NULL
  LOOP
    SELECT stock, COALESCE(variant_stock, '{}'::jsonb)
      INTO v_stock_actual, v_variant_stock
      FROM public.store_products WHERE id = v_item.product_id FOR UPDATE;

    IF v_stock_actual IS NULL THEN
      CONTINUE;
    END IF;

    -- Si hay selección de variante, devolver al bucket de la variante
    v_variant_key := NULL;
    IF v_item.variant_selection IS NOT NULL AND v_item.variant_selection <> '{}'::jsonb THEN
      SELECT string_agg(key || ':' || (value #>> '{}'), '|' ORDER BY key)
        INTO v_variant_key
        FROM jsonb_each(v_item.variant_selection);
    END IF;

    IF v_variant_key IS NOT NULL THEN
      v_current_variant_qty := COALESCE((v_variant_stock ->> v_variant_key)::integer, 0);
      v_variant_stock := jsonb_set(
        v_variant_stock,
        ARRAY[v_variant_key],
        to_jsonb(v_current_variant_qty + v_item.quantity),
        true
      );
    END IF;

    UPDATE public.store_products
      SET stock = v_stock_actual + v_item.quantity,
          variant_stock = v_variant_stock,
          updated_at = now()
      WHERE id = v_item.product_id;

    INSERT INTO public.stock_movements
      (product_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, registrado_por, order_id, variante)
    VALUES
      (v_item.product_id, 'ingreso', v_item.quantity, v_stock_actual, v_stock_actual + v_item.quantity,
       COALESCE('Anulación pedido #' || v_order.order_number || COALESCE(' — ' || _reason, ''), 'Anulación pedido'),
       v_uid, _order_id, v_variant_key);
  END LOOP;

  UPDATE public.store_orders
    SET status = 'cancelado',
        cancelled_at = now(),
        cancel_reason = _reason,
        stock_restored_at = now(),
        updated_at = now()
    WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', _order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_store_order(uuid, text) TO authenticated;