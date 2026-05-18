
CREATE OR REPLACE FUNCTION public.recalc_gasto_ejecucion(p_ejec_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_ejec record;
  v_last record;
  v_new_estado text;
BEGIN
  SELECT * INTO v_ejec FROM public.gastos_ejecuciones WHERE id = p_ejec_id;
  IF v_ejec IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_total
  FROM public.gastos_ejecucion_pagos WHERE ejecucion_id = p_ejec_id;

  SELECT * INTO v_last FROM public.gastos_ejecucion_pagos
    WHERE ejecucion_id = p_ejec_id
    ORDER BY fecha DESC, created_at DESC LIMIT 1;

  IF v_total <= 0 THEN
    IF v_ejec.fecha_vencimiento IS NOT NULL AND v_ejec.fecha_vencimiento < CURRENT_DATE THEN
      v_new_estado := 'vencido';
    ELSE
      v_new_estado := 'pendiente';
    END IF;
  ELSIF v_total >= COALESCE(v_ejec.monto_previsto, 0) THEN
    v_new_estado := 'pagado';
  ELSE
    v_new_estado := 'parcial';
  END IF;

  UPDATE public.gastos_ejecuciones
  SET estado = v_new_estado::gasto_ejecucion_estado,
      monto_pagado = CASE WHEN v_total > 0 THEN v_total ELSE NULL END,
      fecha_pago = CASE WHEN v_total > 0 THEN v_last.fecha ELSE NULL END,
      forma_pago = CASE WHEN v_total > 0 THEN v_last.forma_pago ELSE NULL END,
      updated_at = now()
  WHERE id = p_ejec_id;
END;
$$;
