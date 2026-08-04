CREATE OR REPLACE FUNCTION public.apply_stock_count_adjustments(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_pid uuid;
  v_sig text;
  v_contado int;
  v_anterior int;
  v_vs jsonb;
  v_ajustes int := 0;
  v_movs int := 0;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_sig := nullif(v_item->>'variant_sig', '');
    v_contado := (v_item->>'contado')::int;
    IF v_pid IS NULL OR v_contado IS NULL THEN CONTINUE; END IF;

    SELECT coalesce(variant_stock, '{}'::jsonb), coalesce(stock, 0)
      INTO v_vs, v_anterior
      FROM public.store_products WHERE id = v_pid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_sig IS NULL THEN
      IF v_anterior = v_contado THEN CONTINUE; END IF;
      UPDATE public.store_products SET stock = v_contado, updated_at = now() WHERE id = v_pid;
    ELSE
      v_anterior := coalesce((v_vs->>v_sig)::int, 0);
      IF v_anterior = v_contado THEN CONTINUE; END IF;
      UPDATE public.store_products
        SET variant_stock = coalesce(variant_stock, '{}'::jsonb) || jsonb_build_object(v_sig, v_contado),
            updated_at = now()
      WHERE id = v_pid;
    END IF;

    v_ajustes := v_ajustes + 1;
    INSERT INTO public.stock_movements (product_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, registrado_por, variante)
    VALUES (
      v_pid,
      CASE WHEN v_contado > v_anterior THEN 'ingreso' ELSE 'egreso' END,
      abs(v_contado - v_anterior),
      v_anterior,
      v_contado,
      'ajuste por conteo',
      v_uid,
      v_sig
    );
    v_movs := v_movs + 1;
  END LOOP;

  RETURN jsonb_build_object('ajustes', v_ajustes, 'movimientos', v_movs);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_stock_count_adjustments(jsonb) TO authenticated;