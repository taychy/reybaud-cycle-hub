CREATE OR REPLACE FUNCTION public.delivery_list_summary_row(p_list_id uuid)
RETURNS TABLE(
  list_id uuid, titulo text, caja_estado text,
  items_total int, items_entregados int, items_pendientes int,
  esperado_cobrar numeric, total_cobrado numeric, total_cobrado_validado numeric,
  total_pendiente numeric, costo_total_mercaderia numeric, pagado_a_proveedor numeric,
  saldo_a_proveedor numeric, margen_bruto numeric, cobros_sin_validar int,
  tc_usd numeric, moneda_items text, esperado_cobrar_nativo numeric,
  costo_total_nativo numeric, costo_desde_items boolean,
  otras_salidas numeric, salidas_totales numeric
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
  v_costo_ars numeric;
  v_cobrado numeric;
  v_cobrado_val numeric;
  v_pagado_prov numeric;
  v_otras numeric;
  v_titulo text;
  v_caja text;
  v_total int;
  v_prep int;
  v_pend int;
  v_sin_val int;
BEGIN
  SELECT COALESCE(dl.tc_usd, 0), COALESCE(dl.pagado_a_proveedor, 0), dl.titulo, dl.caja_estado
    INTO v_tc, v_pagado_prov, v_titulo, v_caja
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
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE i.preparado)::int,
    COUNT(*) FILTER (WHERE NOT i.preparado)::int,
    COALESCE(SUM(COALESCE(i.precio_venta,0) * COALESCE(i.cantidad,1)), 0),
    COALESCE(SUM(COALESCE(i.costo_unitario,0) * COALESCE(i.cantidad,1)), 0),
    COALESCE(SUM(COALESCE(i.precio_venta,0) * COALESCE(i.cantidad,1)
      * CASE WHEN COALESCE(i.moneda,'ARS') = 'ARS' THEN 1 ELSE COALESCE(NULLIF(v_tc,0), 0) END), 0),
    COALESCE(SUM(COALESCE(i.costo_unitario,0) * COALESCE(i.cantidad,1)
      * CASE WHEN COALESCE(i.moneda,'ARS') = 'ARS' THEN 1 ELSE COALESCE(NULLIF(v_tc,0), 0) END), 0)
  INTO v_total, v_prep, v_pend, v_venta_nativo, v_costo_items_nativo, v_venta_ars, v_costo_items_ars
  FROM delivery_list_items i WHERE i.list_id = p_list_id;

  -- Cobranzas: normalizadas a ARS segun la moneda de cada pago
  SELECT COALESCE(SUM(p.monto * CASE WHEN COALESCE(p.moneda,'ARS') = 'ARS' THEN 1 ELSE COALESCE(NULLIF(v_tc,0), 0) END), 0),
         COALESCE(SUM(p.monto * CASE WHEN COALESCE(p.moneda,'ARS') = 'ARS' THEN 1 ELSE COALESCE(NULLIF(v_tc,0), 0) END) FILTER (WHERE p.validado), 0),
         COUNT(*) FILTER (WHERE p.validado IS NULL OR p.validado = false)::int
    INTO v_cobrado, v_cobrado_val, v_sin_val
  FROM delivery_list_payments p WHERE p.list_id = p_list_id;

  SELECT COALESCE(SUM(
    sp.monto * CASE WHEN COALESCE(sp.moneda,'ARS') = 'ARS' THEN 1 ELSE COALESCE(NULLIF(v_tc,0), 0) END
  ), 0)
    INTO v_otras
  FROM delivery_supplier_payments sp
  WHERE sp.delivery_list_id = p_list_id AND COALESCE(sp.categoria,'proveedor') <> 'proveedor';

  -- El costo de mercaderia se calcula siempre desde los items
  v_costo_ars := v_costo_items_ars;

  RETURN QUERY SELECT
    p_list_id, v_titulo, v_caja,
    COALESCE(v_total,0), COALESCE(v_prep,0), COALESCE(v_pend,0),
    v_venta_ars, v_cobrado, v_cobrado_val,
    v_venta_ars - v_cobrado,
    v_costo_ars, v_pagado_prov, v_costo_ars - v_pagado_prov,
    v_cobrado - v_costo_ars - v_otras,
    COALESCE(v_sin_val,0),
    NULLIF(v_tc, 0),
    v_moneda,
    v_venta_nativo,
    v_costo_items_nativo,
    true,
    v_otras,
    v_pagado_prov + v_otras;
END;
$$;