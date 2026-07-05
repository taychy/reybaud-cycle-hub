CREATE OR REPLACE FUNCTION public.generate_gastos_ejecuciones_month(p_mes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
  v_year int;
  v_month int;
  v_last_day int;
  v_dia int;
  v_fecha date;
  v_saldo numeric;
  v_new_ejec_id uuid;
  r record;
BEGIN
  v_year := split_part(p_mes,'-',1)::int;
  v_month := split_part(p_mes,'-',2)::int;
  v_last_day := EXTRACT(day FROM (make_date(v_year, v_month, 1) + interval '1 month - 1 day'))::int;

  FOR r IN
    SELECT * FROM public.gastos_recurrentes
    WHERE activo = true
      AND (
        frecuencia = 'mensual'
        OR (frecuencia = 'bimestral' AND v_month % 2 = 0)
        OR (frecuencia = 'trimestral' AND v_month % 3 = 0)
        OR (frecuencia = 'semestral' AND v_month % 6 = 0)
        OR (frecuencia = 'anual' AND v_month = 1)
        OR (meses_aplicables IS NOT NULL AND v_month = ANY(meses_aplicables))
        OR frecuencia = 'variable'
      )
  LOOP
    v_dia := LEAST(COALESCE(r.dia_vencimiento, 10), v_last_day);
    v_fecha := make_date(v_year, v_month, v_dia);

    -- Saldo pendiente acumulado de meses anteriores (pagos parciales o vencidos sin pagar completo)
    SELECT COALESCE(SUM(
      GREATEST(
        COALESCE(ge.monto_previsto,0) - COALESCE((
          SELECT SUM(gep.monto)
          FROM public.gastos_ejecucion_pagos gep
          WHERE gep.ejecucion_id = ge.id
            AND COALESCE(gep.es_excedente,false) = false
        ),0),
        0
      )
    ),0)
    INTO v_saldo
    FROM public.gastos_ejecuciones ge
    WHERE ge.recurrente_id = r.id
      AND ge.mes < p_mes
      AND ge.estado IN ('parcial','vencido');

    INSERT INTO public.gastos_ejecuciones (
      recurrente_id, mes, fecha_vencimiento, monto_previsto, moneda, estado, notas
    ) VALUES (
      r.id, p_mes, v_fecha,
      r.monto_estimado + COALESCE(v_saldo,0),
      r.moneda, 'pendiente',
      CASE WHEN COALESCE(v_saldo,0) > 0
           THEN '[' || to_char(now(),'YYYY-MM-DD') || '] Incluye saldo trasladado: ' || v_saldo::text
           ELSE NULL END
    )
    ON CONFLICT (recurrente_id, mes) DO NOTHING
    RETURNING id INTO v_new_ejec_id;

    IF FOUND THEN
      v_inserted := v_inserted + 1;

      -- Cerrar meses anteriores con saldo como "omitido" para no duplicar en agenda
      IF COALESCE(v_saldo,0) > 0 THEN
        UPDATE public.gastos_ejecuciones
        SET estado = 'omitido',
            notas = COALESCE(notas || E'\n','') ||
                    '[' || to_char(now(),'YYYY-MM-DD') || '] Saldo trasladado a ' || p_mes,
            updated_at = now()
        WHERE recurrente_id = r.id
          AND mes < p_mes
          AND estado IN ('parcial','vencido')
          AND COALESCE(monto_previsto,0) - COALESCE((
            SELECT SUM(gep.monto) FROM public.gastos_ejecucion_pagos gep
            WHERE gep.ejecucion_id = gastos_ejecuciones.id
              AND COALESCE(gep.es_excedente,false) = false
          ),0) > 0;
      END IF;
    END IF;
  END LOOP;

  -- Marcar vencidas del mes actual
  UPDATE public.gastos_ejecuciones
  SET estado = 'vencido', updated_at = now()
  WHERE mes = p_mes
    AND estado = 'pendiente'
    AND fecha_vencimiento < CURRENT_DATE;

  RETURN v_inserted;
END;
$function$;