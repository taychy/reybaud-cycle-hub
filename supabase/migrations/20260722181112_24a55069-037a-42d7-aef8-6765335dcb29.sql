
CREATE OR REPLACE FUNCTION public.finalize_supplier_order_entry(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _order public.supplier_orders%ROWTYPE;
  _item RECORD;
  _prod public.store_products%ROWTYPE;
  _unlinked jsonb := '[]'::jsonb;
  _variant_key text;
  _v jsonb;
  _current_qty int;
  _new_qty int;
  _updates int := 0;
  _parts text[];
  _vname text;
  _vval text;
  _ik text;
BEGIN
  SELECT * INTO _order FROM public.supplier_orders WHERE id = _order_id;
  IF _order.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF _order.estado = 'cerrado' THEN
    RETURN jsonb_build_object('ok', true, 'already_closed', true);
  END IF;

  -- Validation
  FOR _item IN
    SELECT * FROM public.supplier_order_items
    WHERE supplier_order_id = _order_id AND COALESCE(cantidad_recibida,0) > 0
  LOOP
    IF _item.product_id IS NULL THEN
      _unlinked := _unlinked || jsonb_build_object('item_id', _item.id, 'nombre', _item.producto_nombre, 'reason', 'sin_producto');
      CONTINUE;
    END IF;
    SELECT * INTO _prod FROM public.store_products WHERE id = _item.product_id;
    IF _prod.id IS NULL THEN
      _unlinked := _unlinked || jsonb_build_object('item_id', _item.id, 'nombre', _item.producto_nombre, 'reason', 'producto_no_existe');
      CONTINUE;
    END IF;
    IF _prod.variants IS NOT NULL AND jsonb_array_length(_prod.variants) > 0 THEN
      IF _item.variante IS NULL OR _item.variante = '{}'::jsonb THEN
        _unlinked := _unlinked || jsonb_build_object('item_id', _item.id, 'nombre', _item.producto_nombre, 'reason', 'sin_variante');
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(_unlinked) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'unlinked', _unlinked);
  END IF;

  -- Apply
  FOR _item IN
    SELECT * FROM public.supplier_order_items
    WHERE supplier_order_id = _order_id AND COALESCE(cantidad_recibida,0) > 0
  LOOP
    SELECT * INTO _prod FROM public.store_products WHERE id = _item.product_id;
    _variant_key := '';
    _parts := ARRAY[]::text[];
    IF _prod.variants IS NOT NULL AND jsonb_array_length(_prod.variants) > 0 THEN
      FOR _v IN SELECT * FROM jsonb_array_elements(_prod.variants) LOOP
        _vname := _v->>'name';
        _vval := NULL;
        FOR _ik IN SELECT jsonb_object_keys(_item.variante) LOOP
          IF lower(_ik) = lower(_vname) THEN
            _vval := _item.variante->>_ik;
            EXIT;
          END IF;
        END LOOP;
        IF _vval IS NOT NULL THEN
          _parts := array_append(_parts, _vname || ':' || _vval);
        END IF;
      END LOOP;
      _variant_key := array_to_string(_parts, '|');
    END IF;

    _current_qty := 0;
    IF _variant_key <> '' THEN
      _current_qty := COALESCE((_prod.variant_stock->>_variant_key)::int, 0);
      _new_qty := _current_qty + _item.cantidad_recibida;
      UPDATE public.store_products
      SET variant_stock = COALESCE(variant_stock, '{}'::jsonb) || jsonb_build_object(_variant_key, _new_qty),
          stock = COALESCE(stock,0) + _item.cantidad_recibida,
          updated_at = now()
      WHERE id = _item.product_id;
    ELSE
      _new_qty := COALESCE(_prod.stock,0) + _item.cantidad_recibida;
      UPDATE public.store_products
      SET stock = _new_qty, updated_at = now()
      WHERE id = _item.product_id;
      _current_qty := COALESCE(_prod.stock,0);
    END IF;

    INSERT INTO public.stock_movements(product_id, variante, tipo, cantidad, stock_anterior, stock_nuevo, motivo, order_id)
    VALUES (_item.product_id, NULLIF(_variant_key,''), 'ingreso', _item.cantidad_recibida, _current_qty, _new_qty, 'ingreso_proveedor:' || _order.numero, _order_id);

    _updates := _updates + 1;
  END LOOP;

  UPDATE public.supplier_orders SET estado = 'cerrado', updated_at = now() WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'items_procesados', _updates);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_supplier_order_entry(uuid) TO authenticated;
