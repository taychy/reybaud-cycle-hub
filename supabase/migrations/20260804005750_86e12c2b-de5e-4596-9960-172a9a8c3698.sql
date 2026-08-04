CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text,
  confirmado_por uuid,
  confirmado_por_nombre text,
  total_items int NOT NULL DEFAULT 0,
  items_coinciden int NOT NULL DEFAULT 0,
  items_diferencia int NOT NULL DEFAULT 0,
  items_sin_contar int NOT NULL DEFAULT 0,
  unidades_faltantes int NOT NULL DEFAULT 0,
  unidades_sobrantes int NOT NULL DEFAULT 0,
  movimientos_generados int NOT NULL DEFAULT 0,
  observaciones text,
  reporte text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_counts TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins y deposito ven conteos" ON public.stock_counts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'deposito'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'deposito'::app_role));

CREATE TABLE public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.store_products(id) ON DELETE SET NULL,
  product_name text,
  variante text,
  esperado int,
  contado int,
  diferencia int,
  movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_count_items_count ON public.stock_count_items(count_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_items TO authenticated;
GRANT ALL ON public.stock_count_items TO service_role;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins y deposito ven items de conteo" ON public.stock_count_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'deposito'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'deposito'::app_role));

CREATE OR REPLACE FUNCTION public.apply_stock_count_adjustments(
  p_items jsonb,
  p_categoria text DEFAULT NULL,
  p_observaciones text DEFAULT NULL,
  p_reporte text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_count_id uuid;
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
  v_coinciden int := 0;
  v_dif int := 0;
  v_sin int := 0;
  v_falt int := 0;
  v_sobr int := 0;
  v_total int := 0;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT coalesce(
    (SELECT nombre || ' ' || coalesce(apellido, '') FROM public.admin_profiles WHERE user_id = v_uid LIMIT 1),
    (SELECT nombre FROM public.deposito_profiles WHERE user_id = v_uid LIMIT 1),
    (SELECT email FROM auth.users WHERE id = v_uid)
  ) INTO v_nombre;

  INSERT INTO public.stock_counts (categoria, confirmado_por, confirmado_por_nombre, observaciones, reporte)
  VALUES (p_categoria, v_uid, v_nombre, p_observaciones, p_reporte)
  RETURNING id INTO v_count_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_sig := nullif(v_item->>'variant_sig', '');
    v_pname := v_item->>'product_name';
    v_contado := nullif(v_item->>'contado', '')::int;
    v_esperado := coalesce(nullif(v_item->>'esperado', '')::int, 0);
    v_total := v_total + 1;
    v_mov_id := NULL;

    IF v_pid IS NULL THEN CONTINUE; END IF;

    IF v_contado IS NULL THEN
      v_sin := v_sin + 1;
      INSERT INTO public.stock_count_items (count_id, product_id, product_name, variante, esperado, contado, diferencia)
      VALUES (v_count_id, v_pid, v_pname, v_sig, v_esperado, NULL, NULL);
      CONTINUE;
    END IF;

    SELECT coalesce(variant_stock, '{}'::jsonb), coalesce(stock, 0)
      INTO v_vs, v_anterior
      FROM public.store_products WHERE id = v_pid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_sig IS NOT NULL THEN
      v_anterior := coalesce((v_vs->>v_sig)::int, 0);
    END IF;

    IF v_contado = v_anterior THEN
      v_coinciden := v_coinciden + 1;
    ELSE
      v_dif := v_dif + 1;
      IF v_contado < v_anterior THEN v_falt := v_falt + (v_anterior - v_contado);
      ELSE v_sobr := v_sobr + (v_contado - v_anterior); END IF;

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

    INSERT INTO public.stock_count_items (count_id, product_id, product_name, variante, esperado, contado, diferencia, movement_id)
    VALUES (v_count_id, v_pid, v_pname, v_sig, v_anterior, v_contado, v_contado - v_anterior, v_mov_id);
  END LOOP;

  UPDATE public.stock_counts
    SET total_items = v_total,
        items_coinciden = v_coinciden,
        items_diferencia = v_dif,
        items_sin_contar = v_sin,
        unidades_faltantes = v_falt,
        unidades_sobrantes = v_sobr,
        movimientos_generados = v_ajustes
  WHERE id = v_count_id;

  RETURN jsonb_build_object('count_id', v_count_id, 'ajustes', v_ajustes, 'movimientos', v_ajustes,
    'coinciden', v_coinciden, 'diferencias', v_dif, 'sin_contar', v_sin);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_stock_count_adjustments(jsonb, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_stock_count_adjustments(jsonb, text, text, text) TO authenticated;