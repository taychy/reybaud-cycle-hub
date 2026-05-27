
-- ============================================================
-- A) LIMPIEZA: borrar duplicados de Scarlett (1,860,000) y Claudio (1,660,000)
-- Se conservan los pagos directos a la ejecución (1,422,000 y 1,660,000)
-- ============================================================

-- Movimientos de deuda duplicados (y sus gastos asociados)
WITH movs_a_borrar AS (
  SELECT dm.id AS mov_id, dm.gasto_id
  FROM public.gastos_deuda_movimientos dm
  WHERE dm.id IN (
    '4303ae54-7e1e-47c3-a596-e463a7b59bfc',
    '79884484-17fd-4abe-9261-84cba1f1235c',
    '76633ffd-cb4a-4be8-916a-bed8d338c66b',
    '0c3f9b49-8035-4944-8e76-70dd797bfd4c',
    '753a4d7d-bcef-4755-ae9c-32257b4eedab',
    '8edb2995-d7e2-4872-910a-ee37fac6b734',
    '0daea9b7-e200-4b7f-9ad0-0cd9ff19d45a',
    'b163cfdf-007e-479f-9a74-299aee532fee',
    '3c9f5299-cdf3-42fa-80c4-967dcb8e4a6c',
    '32c56573-0ae5-4491-82d4-caa091545612'
  )
),
del_gastos AS (
  DELETE FROM public.gastos
  WHERE id IN (SELECT gasto_id FROM movs_a_borrar WHERE gasto_id IS NOT NULL)
  RETURNING id
)
DELETE FROM public.gastos_deuda_movimientos
WHERE id IN (SELECT mov_id FROM movs_a_borrar);

-- ============================================================
-- B1) Fix get_gasto_recurrente_saldo_deuda (ambigüedad recurrente_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_gasto_recurrente_saldo_deuda(p_rec_id uuid)
 RETURNS TABLE(recurrente_id uuid, deuda_automatica numeric, cargos_manuales numeric, ajustes numeric, pagos_deuda numeric, saldo_total numeric, moneda text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_moneda text;
BEGIN
  SELECT r.moneda INTO v_moneda FROM public.gastos_recurrentes r WHERE r.id = p_rec_id;

  RETURN QUERY
  WITH auto_d AS (
    SELECT COALESCE(SUM(GREATEST(
      COALESCE(e.monto_previsto,0) - COALESCE((
        SELECT SUM(p.monto) FROM public.gastos_ejecucion_pagos p WHERE p.ejecucion_id = e.id
      ),0), 0
    )),0) AS total
    FROM public.gastos_ejecuciones e
    WHERE e.recurrente_id = p_rec_id
      AND e.estado IN ('pendiente','parcial','vencido')
      AND e.fecha_vencimiento < CURRENT_DATE
  ),
  movs AS (
    SELECT dm.tipo, COALESCE(SUM(dm.monto),0) AS total
    FROM public.gastos_deuda_movimientos dm
    WHERE dm.recurrente_id = p_rec_id
    GROUP BY dm.tipo
  )
  SELECT
    p_rec_id,
    (SELECT total FROM auto_d)::numeric,
    COALESCE((SELECT total FROM movs WHERE tipo = 'cargo'),0)::numeric,
    COALESCE((SELECT total FROM movs WHERE tipo = 'ajuste'),0)::numeric,
    COALESCE((SELECT total FROM movs WHERE tipo = 'pago'),0)::numeric,
    ((SELECT total FROM auto_d)
      + COALESCE((SELECT total FROM movs WHERE tipo = 'cargo'),0)
      + COALESCE((SELECT total FROM movs WHERE tipo = 'ajuste'),0)
      - COALESCE((SELECT total FROM movs WHERE tipo = 'pago'),0))::numeric,
    v_moneda;
END;
$function$;

-- ============================================================
-- B2) register_gasto_deuda_pago ahora imputa FIFO contra ejecuciones
--     vencidas/parciales/pendientes y recalcula la matriz.
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_gasto_deuda_pago(
  p_rec_id uuid,
  p_monto numeric,
  p_fecha date,
  p_forma_pago text,
  p_notas text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov_id uuid;
  v_rec record;
  v_remaining numeric;
  v_ejec record;
  v_pendiente numeric;
  v_apply numeric;
  v_pagado_total numeric;
  v_gasto_id uuid;
  v_ejecs_tocadas uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar pagos';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  SELECT * INTO v_rec FROM public.gastos_recurrentes WHERE id = p_rec_id;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'Recurrente no encontrado'; END IF;

  v_remaining := p_monto;

  -- Imputar FIFO contra ejecuciones impagas más antiguas
  FOR v_ejec IN
    SELECT e.*
    FROM public.gastos_ejecuciones e
    WHERE e.recurrente_id = p_rec_id
      AND e.estado IN ('pendiente','parcial','vencido')
    ORDER BY e.fecha_vencimiento ASC NULLS LAST, e.mes ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    SELECT COALESCE(SUM(monto),0) INTO v_pagado_total
    FROM public.gastos_ejecucion_pagos WHERE ejecucion_id = v_ejec.id;

    v_pendiente := GREATEST(COALESCE(v_ejec.monto_previsto,0) - v_pagado_total, 0);
    IF v_pendiente <= 0 THEN CONTINUE; END IF;

    v_apply := LEAST(v_pendiente, v_remaining);

    -- Asiento contable
    INSERT INTO public.gastos (
      categoria, subcategoria, descripcion, monto, moneda, fecha,
      recurrente, frecuencia, proveedor, notas, forma_pago
    ) VALUES (
      v_rec.categoria, v_rec.ambito::text,
      v_rec.concepto || ' (' || v_ejec.mes || ') [pago-deuda]',
      v_apply, v_ejec.moneda, p_fecha,
      true, v_rec.frecuencia::text, v_rec.proveedor,
      COALESCE(p_notas,''), p_forma_pago
    ) RETURNING id INTO v_gasto_id;

    -- Pago contra la ejecución (esto sí actualiza la matriz)
    INSERT INTO public.gastos_ejecucion_pagos (
      ejecucion_id, monto, fecha, forma_pago, notas, gasto_id, pagado_por
    ) VALUES (
      v_ejec.id, v_apply, p_fecha, p_forma_pago,
      COALESCE(p_notas,'') || ' [via gestión de deuda]', v_gasto_id, auth.uid()
    );

    v_ejecs_tocadas := v_ejecs_tocadas || v_ejec.id;
    v_remaining := v_remaining - v_apply;
  END LOOP;

  -- Si sobra (pago en exceso o sin ejecuciones), crear asiento residual
  IF v_remaining > 0 THEN
    INSERT INTO public.gastos (
      categoria, subcategoria, descripcion, monto, moneda, fecha,
      recurrente, frecuencia, proveedor, notas, forma_pago
    ) VALUES (
      v_rec.categoria, v_rec.ambito::text,
      'Pago a deuda (sin imputar): ' || v_rec.concepto,
      v_remaining, v_rec.moneda, p_fecha,
      true, v_rec.frecuencia::text, v_rec.proveedor,
      COALESCE(p_notas,'') || ' [pago-deuda no imputado]', p_forma_pago
    ) RETURNING id INTO v_gasto_id;
  END IF;

  -- Movimiento histórico (suma total)
  INSERT INTO public.gastos_deuda_movimientos (
    recurrente_id, tipo, monto, moneda, fecha, forma_pago, notas, gasto_id, creado_por
  ) VALUES (
    p_rec_id, 'pago', p_monto, v_rec.moneda, p_fecha, p_forma_pago,
    p_notas, v_gasto_id, auth.uid()
  ) RETURNING id INTO v_mov_id;

  -- Recalcular cada ejecución tocada → actualiza matriz/agenda
  IF array_length(v_ejecs_tocadas, 1) > 0 THEN
    FOR i IN 1..array_length(v_ejecs_tocadas, 1) LOOP
      PERFORM public.recalc_gasto_ejecucion(v_ejecs_tocadas[i]);
    END LOOP;
  END IF;

  RETURN v_mov_id;
END;
$function$;
