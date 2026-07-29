ALTER TABLE public.supplier_orders
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.store_suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.store_order_items
  ADD COLUMN IF NOT EXISTS supplier_order_item_id uuid REFERENCES public.supplier_order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_ordered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_store_order_items_supplier_order_item
  ON public.store_order_items(supplier_order_item_id);

CREATE OR REPLACE FUNCTION public.create_supplier_order_from_sales(
  p_supplier_id uuid,
  p_proveedor_nombre text,
  p_proveedor_email text,
  p_fecha_estimada_entrega date,
  p_moneda text,
  p_notas text,
  p_groups jsonb
)
RETURNS TABLE (order_id uuid, numero text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_numero text;
  v_group jsonb;
  v_item_id uuid;
  v_total numeric := 0;
  v_source_ids uuid[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_groups IS NULL OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'No hay ítems para pedir';
  END IF;

  INSERT INTO public.supplier_orders (
    supplier_id, proveedor_nombre, proveedor_email, fecha_pedido,
    fecha_estimada_entrega, moneda, notas, created_by
  )
  VALUES (
    p_supplier_id, p_proveedor_nombre, nullif(btrim(coalesce(p_proveedor_email, '')), ''), CURRENT_DATE,
    p_fecha_estimada_entrega, coalesce(nullif(p_moneda, ''), 'ARS'), nullif(btrim(coalesce(p_notas, '')), ''), auth.uid()
  )
  RETURNING id, supplier_orders.numero INTO v_order_id, v_numero;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    INSERT INTO public.supplier_order_items (
      supplier_order_id, product_id, producto_nombre, variante,
      cantidad_pedida, precio_unitario, notas
    )
    VALUES (
      v_order_id,
      nullif(v_group->>'product_id', '')::uuid,
      coalesce(v_group->>'producto_nombre', 'Producto'),
      coalesce(v_group->'variante', '{}'::jsonb),
      greatest(coalesce((v_group->>'cantidad')::int, 0), 0),
      nullif(v_group->>'precio_unitario', '')::numeric,
      nullif(btrim(coalesce(v_group->>'notas', '')), '')
    )
    RETURNING id INTO v_item_id;

    v_total := v_total
      + coalesce(nullif(v_group->>'precio_unitario', '')::numeric, 0)
      * greatest(coalesce((v_group->>'cantidad')::int, 0), 0);

    SELECT array_agg(x::uuid)
      INTO v_source_ids
      FROM jsonb_array_elements_text(coalesce(v_group->'store_order_item_ids', '[]'::jsonb)) AS x;

    IF v_source_ids IS NOT NULL AND array_length(v_source_ids, 1) > 0 THEN
      UPDATE public.store_order_items
         SET supplier_order_item_id = v_item_id,
             supplier_ordered_at = now()
       WHERE id = ANY(v_source_ids)
         AND supplier_order_item_id IS NULL;
    END IF;
  END LOOP;

  UPDATE public.supplier_orders SET total_estimado = v_total WHERE id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_supplier_order_from_sales(uuid, text, text, date, text, text, jsonb) TO authenticated;