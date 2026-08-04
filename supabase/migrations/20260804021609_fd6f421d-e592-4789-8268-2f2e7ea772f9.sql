CREATE OR REPLACE FUNCTION public.tg_store_order_stock_egreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_key text;
  v_trigger_states text[] := ARRAY['pagado','en_preparacion','en_camioneta','listo_retiro','entregado'];
BEGIN
  IF NOT (NEW.status = ANY(v_trigger_states)) OR (COALESCE(OLD.status,'') = ANY(v_trigger_states)) THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.id, oi.product_id, oi.quantity, oi.variant_selection
    FROM public.store_order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE product_id = r.product_id
        AND tipo = 'egreso'
        AND (order_id = NEW.id OR motivo LIKE '%order_item:' || r.id::text || '%')
    ) THEN
      CONTINUE;
    END IF;

    v_key := public.resolve_variant_key(
      r.product_id,
      CASE
        WHEN jsonb_typeof(r.variant_selection) = 'object'
          THEN (SELECT string_agg(key || ':' || value, '|' ORDER BY key) FROM jsonb_each_text(r.variant_selection))
        ELSE NULL
      END
    );

    PERFORM public._adjust_stock_by_key(
      r.product_id, v_key, -GREATEST(COALESCE(r.quantity, 1), 0),
      'Pedido pagado (order_item:' || r.id::text || ')',
      NEW.id, auth.uid()
    );
  END LOOP;

  RETURN NEW;
END;
$$;