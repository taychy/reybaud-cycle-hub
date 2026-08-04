CREATE OR REPLACE FUNCTION public.apply_stock_count_product(p_count_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_pid uuid;
  v_sig text;
  v_pname text;
  v_contado int;
  v_esperado int;
  v_anterior int;
  v_vs jsonb;
  v_mov_id uuid;
  v_ajustes int := 0;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_counts WHERE id = p_count_id) THEN
    RAISE EXCEPTION 'Conteo inexistente';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_sig := nullif(v_item->>'variant_sig', '');
    v_pname := v_item->>'product_name';
    v_contado := nullif(v_item->>'contado', '')::int;
    v_esperado := coalesce(nullif(v_item->>'esperado', '')::int, 0);
    v_mov_id := NULL;
    IF v_pid IS NULL THEN CONTINUE; END IF;
    -- Conteo parcial: lo no contado no se registra ni se informa
    IF v_contado IS NULL THEN CONTINUE; END IF;

    SELECT coalesce(variant_stock, '{}'::jsonb), coalesce(stock, 0)
      INTO v_vs, v_anterior
      FROM public.store_products WHERE id = v_pid FOR UPDATE;

    IF FOUND THEN
      IF v_sig IS NOT NULL THEN
        v_anterior := coalesce((v_vs->>v_sig)::int, 0);
      END IF;

      IF v_anterior <> v_contado THEN
        IF v_sig IS NULL THEN
          UPDATE public.store_products SET stock = v_contado, updated_at = now() WHERE id = v_pid;
        ELSE
          UPDATE public.store_products
            SET variant_stock = coalesce(variant_stock, '{}'::jsonb) || jsonb_build_object(v_sig, v_contado),
                updated_at = now()
          WHERE id = v_pid;
        END IF;

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
        ) RETURNING id INTO v_mov_id;
        v_ajustes := v_ajustes + 1;
      END IF;
    END IF;

    INSERT INTO public.stock_count_items (count_id, product_id, product_name, variante, esperado, contado, diferencia, movement_id)
    VALUES (p_count_id, v_pid, v_pname, v_sig, v_esperado, v_contado, v_contado - v_esperado, v_mov_id)
    ON CONFLICT (count_id, product_id, coalesce(variante, ''))
    DO UPDATE SET contado = excluded.contado,
                  esperado = excluded.esperado,
                  product_name = excluded.product_name,
                  diferencia = excluded.diferencia,
                  movement_id = coalesce(excluded.movement_id, public.stock_count_items.movement_id);
  END LOOP;

  RETURN jsonb_build_object('ajustes', v_ajustes);
END;
$function$;

ALTER FUNCTION public.finalize_stock_count(uuid, text, text, boolean) RENAME TO finalize_stock_count_v2;
ALTER FUNCTION public.finalize_stock_count_v2(uuid, text, text, boolean) RENAME TO finalize_stock_count;
ALTER FUNCTION public.finalize_stock_count(uuid, text, text, boolean) SET search_path TO 'public';