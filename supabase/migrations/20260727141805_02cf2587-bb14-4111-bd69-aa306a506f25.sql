ALTER TABLE public.delivery_lists ADD COLUMN IF NOT EXISTS tc_usd numeric;

DROP FUNCTION IF EXISTS public.delivery_list_summary_row(uuid);

CREATE OR REPLACE FUNCTION public.delivery_list_summary_row(p_list_id uuid)
RETURNS TABLE(
  list_id uuid,
  titulo text,
  caja_estado text,
  items_total integer,
  items_entregados integer,
  items_pendientes integer,
  esperado_cobrar numeric,
  total_cobrado numeric,
  total_cobrado_validado numeric,
  total_pendiente numeric,
  costo_total_mercaderia numeric,
  pagado_a_proveedor numeric,
  saldo_a_proveedor numeric,
  margen_bruto numeric,
  cobros_sin_validar integer,
  tc_usd numeric,
  moneda_items text,
  esperado_cobrar_nativo numeric,
  costo_total_nativo numeric,
  costo_desde_items boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tc numeric;
  v_monedas text[];
  v_moneda text;
  v_venta_nativo numeric;
  v_costo_items_nativo numeric;
  v_venta_ars numeric;
  v_costo_items_ars numeric;
  v_costo_manual numeric;
  v_costo_ars numeric;
  v_desde_items boolean;
  v_cobrado numeric;
  v_pagado_prov numeric;
BEGIN
  SELECT COALESCE(dl.tc_usd, 0), COALESCE(dl.costo_total_mercaderia, 0), COALESCE(dl.pagado_a_proveedor, 0)
    INTO v_tc, v_costo_manual, v_pagado_prov
  FROM delivery_lists dl WHERE dl.id = p_list_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT ARRAY(SELECT DISTINCT COALESCE(i.moneda, 'ARS') FROM delivery_list_items i WHERE i.list_id = p_list_id)
    INTO v_monedas;

  v_moneda := CASE
    WHEN v_monedas IS NULL OR array_length(v_monedas, 1) IS NULL THEN 'ARS'
    WHEN array_length(v_monedas, 1) = 1 THEN v_monedas[1]
    ELSE 'MIXTA'
  END;

  SELECT
    COALESCE(SUM(COALESCE(i.precio_venta,0) * COALESCE(i.cantidad,1)), 0),
    COALESCE(SUM(COALESCE(i.costo_unitario,0) * COALESCE(i.cantidad,1)), 0),
    COALESCE(SUM(COALESCE(i.precio_venta,0) * COALESCE(i.cantidad,1)
      * CASE WHEN COALESCE(i.moneda,'ARS') = 'ARS' THEN 1 ELSE NULLIF(v_tc,0) END), 0),
    COALESCE(SUM(COALESCE(i.costo_unitario,0) * COALESCE(i.cantidad,1)
      * CASE WHEN COALESCE(i.moneda,'ARS') = 'ARS' THEN 1 ELSE NULLIF(v_tc,0) END), 0)
  INTO v_venta_nativo, v_costo_items_nativo, v_venta_ars, v_costo_items_ars
  FROM delivery_list_items i WHERE i.list_id = p_list_id;

  SELECT COALESCE(SUM(p.monto), 0) INTO v_cobrado
  FROM delivery_list_payments p WHERE p.list_id = p_list_id;

  IF v_costo_manual > 0 THEN
    v_costo_ars := v_costo_manual;
    v_desde_items := false;
  ELSE
    v_costo_ars := v_costo_items_ars;
    v_desde_items := true;
  END IF;

  RETURN QUERY
  SELECT
    dl.id,
    dl.titulo,
    dl.caja_estado,
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_items WHERE list_id = dl.id), 0),
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_items WHERE list_id = dl.id AND preparado = true), 0),
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_items WHERE list_id = dl.id AND preparado = false), 0),
    v_venta_ars,
    v_cobrado,
    COALESCE((SELECT SUM(monto) FROM delivery_list_payments WHERE list_id = dl.id AND validado = true), 0),
    v_venta_ars - v_cobrado,
    v_costo_ars,
    v_pagado_prov,
    v_costo_ars - v_pagado_prov,
    v_cobrado - v_costo_ars,
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_payments WHERE list_id = dl.id AND (validado IS NULL OR validado = false)), 0),
    NULLIF(v_tc, 0),
    v_moneda,
    v_venta_nativo,
    CASE WHEN v_desde_items THEN v_costo_items_nativo ELSE v_costo_manual END,
    v_desde_items
  FROM delivery_lists dl WHERE dl.id = p_list_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delivery_list_summary_row(uuid) TO authenticated, service_role;