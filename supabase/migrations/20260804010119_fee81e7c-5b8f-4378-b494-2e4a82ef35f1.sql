ALTER TABLE public.stock_counts
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'finalizado',
  ADD COLUMN IF NOT EXISTS finalizado_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS stock_count_items_unique_variant
  ON public.stock_count_items (count_id, product_id, coalesce(variante, ''));

-- 1) Abrir o retomar conteo
CREATE OR REPLACE FUNCTION public.start_stock_count(p_categoria text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_id uuid;
  v_resumed boolean := false;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id INTO v_id
  FROM public.stock_counts
  WHERE estado = 'en_curso' AND confirmado_por = v_uid AND coalesce(categoria,'') = coalesce(p_categoria,'')
  ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('count_id', v_id, 'resumed', true);
  END IF;

  SELECT coalesce(
    (SELECT nombre || ' ' || coalesce(apellido, '') FROM public.admin_profiles WHERE user_id = v_uid LIMIT 1),
    (SELECT nombre FROM public.deposito_profiles WHERE user_id = v_uid LIMIT 1),
    (SELECT email FROM auth.users WHERE id = v_uid)
  ) INTO v_nombre;

  INSERT INTO public.stock_counts (categoria, confirmado_por, confirmado_por_nombre, estado)
  VALUES (p_categoria, v_uid, v_nombre, 'en_curso')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('count_id', v_id, 'resumed', false);
END;
$function$;

-- 2) Confirmar un producto: ajusta stock al instante y guarda el detalle
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

    IF v_contado IS NOT NULL THEN
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
    END IF;

    INSERT INTO public.stock_count_items (count_id, product_id, product_name, variante, esperado, contado, diferencia, movement_id)
    VALUES (p_count_id, v_pid, v_pname, v_sig, v_esperado, v_contado,
            CASE WHEN v_contado IS NULL THEN NULL ELSE v_contado - v_esperado END, v_mov_id)
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

-- 3) Finalizar conteo: recalcula totales y guarda reporte
CREATE OR REPLACE FUNCTION public.finalize_stock_count(p_count_id uuid, p_observaciones text DEFAULT NULL, p_reporte text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_total int; v_coin int; v_dif int; v_sin int; v_falt int; v_sobr int; v_movs int;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
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
$function$;