
-- Extiende register_gasto_pago_v2 con sync opcional al catálogo
CREATE OR REPLACE FUNCTION public.register_gasto_pago_v2(
  p_ejec_id uuid,
  p_monto numeric,
  p_fecha date,
  p_forma_pago text,
  p_notas text DEFAULT NULL,
  p_es_excedente boolean DEFAULT false,
  p_motivo_excedente text DEFAULT NULL,
  p_nuevo_previsto numeric DEFAULT NULL,
  p_sync_catalogo boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ejec record;
  v_rec record;
  v_gasto_id uuid;
  v_pago_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar pagos';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  SELECT * INTO v_ejec FROM public.gastos_ejecuciones WHERE id = p_ejec_id;
  IF v_ejec IS NULL THEN RAISE EXCEPTION 'Ejecución no encontrada'; END IF;
  SELECT * INTO v_rec FROM public.gastos_recurrentes WHERE id = v_ejec.recurrente_id;

  -- Ajustar previsto en la cuota
  IF p_nuevo_previsto IS NOT NULL AND p_nuevo_previsto <> v_ejec.monto_previsto THEN
    UPDATE public.gastos_ejecuciones
    SET monto_previsto = p_nuevo_previsto,
        notas = COALESCE(notas || E'\n','') ||
                '[' || to_char(now(),'YYYY-MM-DD') || '] Previsto ajustado al pagar: ' ||
                COALESCE(v_ejec.monto_previsto::text,'0') || ' → ' || p_nuevo_previsto::text,
        updated_at = now()
    WHERE id = p_ejec_id;

    -- Sincronizar catálogo si corresponde (no para excedentes)
    IF COALESCE(p_sync_catalogo, true) AND NOT COALESCE(p_es_excedente, false) THEN
      UPDATE public.gastos_recurrentes
      SET monto_estimado = p_nuevo_previsto,
          updated_at = now()
      WHERE id = v_ejec.recurrente_id;
    END IF;
  END IF;

  INSERT INTO public.gastos (
    categoria, subcategoria, descripcion, monto, moneda, fecha,
    recurrente, frecuencia, proveedor, notas, forma_pago
  ) VALUES (
    v_rec.categoria, v_rec.ambito::text,
    v_rec.concepto || ' (' || v_ejec.mes || ')' ||
      CASE WHEN p_es_excedente THEN ' [excedente]' ELSE '' END,
    p_monto, v_ejec.moneda, p_fecha,
    true, v_rec.frecuencia::text, v_rec.proveedor,
    CASE WHEN p_es_excedente
         THEN COALESCE(p_notas || ' — ','') || 'Pagado de más' ||
              CASE WHEN p_motivo_excedente IS NOT NULL THEN ': ' || p_motivo_excedente ELSE '' END
         ELSE p_notas END,
    p_forma_pago
  ) RETURNING id INTO v_gasto_id;

  INSERT INTO public.gastos_ejecucion_pagos (
    ejecucion_id, monto, fecha, forma_pago, notas, gasto_id, pagado_por,
    es_excedente, motivo_excedente
  ) VALUES (
    p_ejec_id, p_monto, p_fecha, p_forma_pago, p_notas, v_gasto_id, auth.uid(),
    COALESCE(p_es_excedente,false), p_motivo_excedente
  ) RETURNING id INTO v_pago_id;

  PERFORM public.recalc_gasto_ejecucion(p_ejec_id);

  RETURN v_pago_id;
END;
$function$;

-- Extiende adjust_ejec_previsto_range con sync opcional al catálogo
CREATE OR REPLACE FUNCTION public.adjust_ejec_previsto_range(
  p_rec_id uuid,
  p_mes_desde text,
  p_mes_hasta text,
  p_nuevo_previsto numeric,
  p_motivo text DEFAULT NULL,
  p_sync_catalogo boolean DEFAULT true
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_ejec record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede ajustar el previsto';
  END IF;
  IF p_nuevo_previsto IS NULL OR p_nuevo_previsto < 0 THEN
    RAISE EXCEPTION 'Monto previsto inválido';
  END IF;

  FOR v_ejec IN
    SELECT * FROM public.gastos_ejecuciones
    WHERE recurrente_id = p_rec_id
      AND mes >= p_mes_desde
      AND mes <= p_mes_hasta
      AND estado <> 'pagado'
  LOOP
    UPDATE public.gastos_ejecuciones
    SET monto_previsto = p_nuevo_previsto,
        notas = COALESCE(notas || E'\n', '') ||
                '[' || to_char(now(),'YYYY-MM-DD') || '] Previsto ajustado: ' ||
                COALESCE(v_ejec.monto_previsto::text, '0') || ' → ' || p_nuevo_previsto::text ||
                CASE WHEN p_motivo IS NOT NULL THEN ' — ' || p_motivo ELSE '' END,
        updated_at = now()
    WHERE id = v_ejec.id;

    PERFORM public.recalc_gasto_ejecucion(v_ejec.id);
    v_count := v_count + 1;
  END LOOP;

  -- Sincronizar catálogo (una sola vez al final)
  IF COALESCE(p_sync_catalogo, true) THEN
    UPDATE public.gastos_recurrentes
    SET monto_estimado = p_nuevo_previsto,
        updated_at = now()
    WHERE id = p_rec_id;
  END IF;

  RETURN v_count;
END;
$function$;
