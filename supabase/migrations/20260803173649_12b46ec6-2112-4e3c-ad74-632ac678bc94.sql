-- 1) Resolver clave de variante a partir de texto libre ("L", "l", "Talle:L")
CREATE OR REPLACE FUNCTION public.resolve_variant_key(p_product_id uuid, p_variante text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock jsonb;
  v_variants jsonb;
  v_key text;
  v_name text;
BEGIN
  IF p_variante IS NULL OR btrim(p_variante) = '' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(variant_stock, '{}'::jsonb), COALESCE(variants, '[]'::jsonb)
    INTO v_stock, v_variants
    FROM public.store_products WHERE id = p_product_id;

  IF v_stock IS NULL THEN RETURN NULL; END IF;

  -- match exacto
  IF v_stock ? p_variante THEN RETURN p_variante; END IF;

  -- match case-insensitive contra las claves existentes o su parte de valor
  SELECT k INTO v_key
  FROM jsonb_object_keys(v_stock) AS k
  WHERE lower(k) = lower(btrim(p_variante))
     OR lower(split_part(k, ':', 2)) = lower(btrim(p_variante))
  LIMIT 1;
  IF v_key IS NOT NULL THEN RETURN v_key; END IF;

  -- construir clave con el nombre del primer grupo de variantes
  IF jsonb_array_length(v_variants) = 1 THEN
    v_name := v_variants->0->>'name';
    IF v_name IS NOT NULL THEN
      RETURN v_name || ':' || upper(btrim(p_variante));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- 2) Ajuste de stock por clave de variante ya resuelta
CREATE OR REPLACE FUNCTION public._adjust_stock_by_key(
  p_product_id uuid,
  p_key text,
  p_delta integer,
  p_motivo text,
  p_order_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old int;
  v_new int;
  v_stock jsonb;
BEGIN
  IF p_delta = 0 THEN RETURN; END IF;

  IF p_key IS NULL THEN
    SELECT COALESCE(stock, 0) INTO v_old FROM public.store_products WHERE id = p_product_id;
    IF NOT FOUND THEN RETURN; END IF;
    v_new := GREATEST(v_old + p_delta, 0);
    UPDATE public.store_products SET stock = v_new WHERE id = p_product_id;
  ELSE
    SELECT COALESCE(variant_stock, '{}'::jsonb) INTO v_stock FROM public.store_products WHERE id = p_product_id;
    IF NOT FOUND THEN RETURN; END IF;
    v_old := COALESCE((v_stock->>p_key)::int, 0);
    v_new := GREATEST(v_old + p_delta, 0);
    UPDATE public.store_products
      SET variant_stock = jsonb_set(v_stock, ARRAY[p_key], to_jsonb(v_new), true)
      WHERE id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements(
    product_id, tipo, cantidad, stock_anterior, stock_nuevo,
    motivo, registrado_por, variante, order_id
  ) VALUES (
    p_product_id,
    CASE WHEN p_delta >= 0 THEN 'ingreso' ELSE 'egreso' END,
    abs(p_delta), v_old, v_new, p_motivo, p_user_id, p_key, p_order_id
  );
END;
$$;

-- 3) Descuento al marcar entregado un ítem de lista de entrega
CREATE OR REPLACE FUNCTION public.tg_delivery_item_stock_egreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key text;
  v_qty int;
BEGIN
  IF NOT (NEW.preparado AND NOT COALESCE(OLD.preparado, false)) THEN
    RETURN NEW;
  END IF;
  IF NEW.store_product_id IS NULL THEN RETURN NEW; END IF;

  v_qty := GREATEST(COALESCE(NEW.cantidad, 1)::int, 0);
  IF v_qty = 0 THEN RETURN NEW; END IF;

  -- idempotencia: este mismo ítem ya descontó
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE product_id = NEW.store_product_id
      AND motivo LIKE '%delivery_item:' || NEW.id::text || '%'
  ) THEN
    RETURN NEW;
  END IF;

  -- ya descontado por el pedido de tienda (webhook MP u otro)
  IF NEW.source_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE order_id = NEW.source_order_id
      AND product_id = NEW.store_product_id
      AND tipo = 'egreso'
  ) THEN
    RETURN NEW;
  END IF;

  -- ya descontado por la preventa
  IF NEW.source_preorder_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE product_id = NEW.store_product_id
      AND motivo LIKE '%preorder:' || NEW.source_preorder_id::text || '%'
  ) THEN
    RETURN NEW;
  END IF;

  v_key := public.resolve_variant_key(NEW.store_product_id, NEW.variante);

  PERFORM public._adjust_stock_by_key(
    NEW.store_product_id,
    v_key,
    -v_qty,
    'Entrega de mercadería (delivery_item:' || NEW.id::text || ')',
    NEW.source_order_id,
    COALESCE(NEW.preparado_by, auth.uid())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_item_stock_egreso ON public.delivery_list_items;
CREATE TRIGGER trg_delivery_item_stock_egreso
AFTER UPDATE OF preparado ON public.delivery_list_items
FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_item_stock_egreso();

-- 4) Descuento al entregar una preventa (si no lo hizo la lista de entrega)
CREATE OR REPLACE FUNCTION public.tg_preorder_stock_egreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key text;
  v_qty int;
  v_item jsonb;
  v_pid uuid;
BEGIN
  IF NOT (NEW.estado = 'entregada' AND COALESCE(OLD.estado, '') <> 'entregada') THEN
    RETURN NEW;
  END IF;

  -- si se entregó vía lista de entrega, ya descontó ahí
  IF EXISTS (
    SELECT 1 FROM public.delivery_list_items
    WHERE source_preorder_id = NEW.id
      AND store_product_id IS NOT NULL
      AND preparado = true
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE motivo LIKE '%preorder:' || NEW.id::text || '%'
  ) THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.items) = 'array' AND jsonb_array_length(COALESCE(NEW.items, '[]'::jsonb)) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
      v_pid := NULLIF(v_item->>'product_id', '')::uuid;
      IF v_pid IS NULL THEN v_pid := NEW.product_id; END IF;
      IF v_pid IS NULL THEN CONTINUE; END IF;
      v_qty := GREATEST(COALESCE((v_item->>'cantidad')::int, 1), 0);
      IF v_qty = 0 THEN CONTINUE; END IF;
      v_key := public.resolve_variant_key(
        v_pid,
        COALESCE(v_item->>'variante', v_item->'variante'->>'Talle', v_item->>'talle')
      );
      PERFORM public._adjust_stock_by_key(
        v_pid, v_key, -v_qty,
        'Preventa entregada (preorder:' || NEW.id::text || ')',
        NULL, auth.uid()
      );
    END LOOP;
  ELSIF NEW.product_id IS NOT NULL THEN
    v_qty := GREATEST(COALESCE(NEW.cantidad, 1), 0);
    IF v_qty > 0 THEN
      v_key := public.resolve_variant_key(
        NEW.product_id,
        CASE
          WHEN jsonb_typeof(NEW.variante) = 'object' THEN (SELECT value FROM jsonb_each_text(NEW.variante) LIMIT 1)
          WHEN jsonb_typeof(NEW.variante) = 'string' THEN NEW.variante #>> '{}'
          ELSE NULL
        END
      );
      PERFORM public._adjust_stock_by_key(
        NEW.product_id, v_key, -v_qty,
        'Preventa entregada (preorder:' || NEW.id::text || ')',
        NULL, auth.uid()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preorder_stock_egreso ON public.store_preorders;
CREATE TRIGGER trg_preorder_stock_egreso
AFTER UPDATE OF estado ON public.store_preorders
FOR EACH ROW EXECUTE FUNCTION public.tg_preorder_stock_egreso();

-- 5) Descuento al entregar un pedido de tienda que aún no descontó (ventas presenciales/efectivo)
CREATE OR REPLACE FUNCTION public.tg_store_order_stock_egreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_key text;
BEGIN
  IF NOT (NEW.status = 'entregado' AND COALESCE(OLD.status, '') <> 'entregado') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.id, oi.product_id, oi.quantity, oi.variant_selection
    FROM public.store_order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
  LOOP
    -- ya descontado por webhook MP, lista de entrega o este mismo ítem
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
      'Pedido entregado (order_item:' || r.id::text || ')',
      NEW.id, auth.uid()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_order_stock_egreso ON public.store_orders;
CREATE TRIGGER trg_store_order_stock_egreso
AFTER UPDATE OF status ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_store_order_stock_egreso();