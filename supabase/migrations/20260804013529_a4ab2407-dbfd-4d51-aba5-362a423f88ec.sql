CREATE OR REPLACE FUNCTION public.finalize_stock_count(
  p_count_id uuid,
  p_observaciones text DEFAULT NULL,
  p_reporte text DEFAULT NULL,
  p_zero_uncounted boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total int; v_coin int; v_dif int; v_sin int; v_falt int; v_sobr int; v_movs int;
  v_rec record;
  v_anterior int;
  v_mov_id uuid;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_zero_uncounted THEN
    FOR v_rec IN
      SELECT i.id, i.product_id, i.variante
        FROM public.stock_count_items i
       WHERE i.count_id = p_count_id AND i.contado IS NULL
    LOOP
      SELECT CASE WHEN v_rec.variante IS NULL
                  THEN coalesce(sp.stock, 0)
                  ELSE coalesce((sp.variant_stock->>v_rec.variante)::int, 0) END
        INTO v_anterior
        FROM public.store_products sp WHERE sp.id = v_rec.product_id FOR UPDATE;

      IF v_anterior IS NULL THEN CONTINUE; END IF;
      v_mov_id := NULL;

      IF v_anterior <> 0 THEN
        IF v_rec.variante IS NULL THEN
          UPDATE public.store_products SET stock = 0, updated_at = now() WHERE id = v_rec.product_id;
        ELSE
          UPDATE public.store_products
             SET variant_stock = coalesce(variant_stock, '{}'::jsonb) || jsonb_build_object(v_rec.variante, 0),
                 updated_at = now()
           WHERE id = v_rec.product_id;
        END IF;

        INSERT INTO public.stock_movements (product_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, registrado_por, variante)
        VALUES (v_rec.product_id, 'egreso', v_anterior, v_anterior, 0, 'ajuste por conteo (no contado)', v_uid, v_rec.variante)
        RETURNING id INTO v_mov_id;
      END IF;

      UPDATE public.stock_count_items
         SET contado = 0,
             diferencia = 0 - coalesce(esperado, 0),
             movement_id = coalesce(v_mov_id, movement_id)
       WHERE id = v_rec.id;
    END LOOP;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE contado IS NOT NULL AND diferencia = 0),
         count(*) FILTER (WHERE contado IS NOT NULL AND diferencia <> 0),
         count(*) FILTER (WHERE contado IS NULL),
         coalesce(sum(CASE WHEN diferencia < 0 THEN -diferencia ELSE 0 END), 0),
         coalesce(sum(CASE WHEN diferencia > 0 THEN diferencia ELSE 0 END), 0),
         count(*) FILTER (WHERE movement_id IS NOT NULL)
    INTO v_total, v_coin, v_dif, v_sin, v_falt, v_sobr, v_movs
  FROM public.stock_count_items WHERE count_id = p_count_id;

  UPDATE public.stock_counts
     SET estado = 'finalizado',
         finalizado_at = now(),
         observaciones = coalesce(p_observaciones, observaciones),
         reporte = coalesce(p_reporte, reporte),
         total_items = coalesce(v_total, 0),
         items_coinciden = coalesce(v_coin, 0),
         items_diferencia = coalesce(v_dif, 0),
         items_sin_contar = coalesce(v_sin, 0),
         unidades_faltantes = coalesce(v_falt, 0),
         unidades_sobrantes = coalesce(v_sobr, 0),
         movimientos_generados = coalesce(v_movs, 0)
   WHERE id = p_count_id;

  RETURN jsonb_build_object('count_id', p_count_id, 'total', coalesce(v_total,0), 'ajustes', coalesce(v_movs,0));
END;
$$;