
-- 1) Modalidad de pago en gastos recurrentes
ALTER TABLE public.gastos_recurrentes
  ADD COLUMN IF NOT EXISTS modalidad_pago text NOT NULL DEFAULT 'anticipado'
    CHECK (modalidad_pago IN ('anticipado','vencido'));

-- 2) Marca de excedente en pagos
ALTER TABLE public.gastos_ejecucion_pagos
  ADD COLUMN IF NOT EXISTS es_excedente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_excedente text;

-- 3) Vínculo gasto ↔ liquidación de coach
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS liquidacion_id uuid REFERENCES public.liquidaciones_mensuales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gastos_liquidacion ON public.gastos(liquidacion_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gastos_liquidacion ON public.gastos(liquidacion_id) WHERE liquidacion_id IS NOT NULL;

-- 4) Recalc actualizado: pagos no excedentes definen estado; excedentes solo suman al total pagado
CREATE OR REPLACE FUNCTION public.recalc_gasto_ejecucion(p_ejec_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_total_no_exc numeric;
  v_ejec record;
  v_last record;
  v_new_estado text;
BEGIN
  SELECT * INTO v_ejec FROM public.gastos_ejecuciones WHERE id = p_ejec_id;
  IF v_ejec IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(monto), 0),
    COALESCE(SUM(CASE WHEN COALESCE(es_excedente,false) = false THEN monto ELSE 0 END), 0)
  INTO v_total, v_total_no_exc
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
  ELSIF v_total_no_exc >= COALESCE(v_ejec.monto_previsto, 0) THEN
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
$function$;

-- 5) Ajustar monto previsto de una cuota (single) o rango (bulk). Solo cuotas NO totalmente pagadas.
CREATE OR REPLACE FUNCTION public.adjust_ejec_previsto_range(
  p_rec_id uuid,
  p_mes_desde text,
  p_mes_hasta text,
  p_nuevo_previsto numeric,
  p_motivo text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_ejec record;
  v_pagado_no_exc numeric;
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
    -- Si ya se pagó algo (no excedente), no permitir bajar previsto por debajo de lo ya pagado
    SELECT COALESCE(SUM(CASE WHEN COALESCE(es_excedente,false)=false THEN monto ELSE 0 END), 0)
    INTO v_pagado_no_exc
    FROM public.gastos_ejecucion_pagos WHERE ejecucion_id = v_ejec.id;

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

  RETURN v_count;
END;
$function$;

-- 6) Registrar pago con soporte de excedente (pagado de más)
CREATE OR REPLACE FUNCTION public.register_gasto_pago_v2(
  p_ejec_id uuid,
  p_monto numeric,
  p_fecha date,
  p_forma_pago text,
  p_notas text DEFAULT NULL,
  p_es_excedente boolean DEFAULT false,
  p_motivo_excedente text DEFAULT NULL,
  p_nuevo_previsto numeric DEFAULT NULL
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

  -- Opcionalmente ajustar previsto en el mismo paso (al pagar)
  IF p_nuevo_previsto IS NOT NULL AND p_nuevo_previsto <> v_ejec.monto_previsto THEN
    UPDATE public.gastos_ejecuciones
    SET monto_previsto = p_nuevo_previsto,
        notas = COALESCE(notas || E'\n','') ||
                '[' || to_char(now(),'YYYY-MM-DD') || '] Previsto ajustado al pagar: ' ||
                COALESCE(v_ejec.monto_previsto::text,'0') || ' → ' || p_nuevo_previsto::text,
        updated_at = now()
    WHERE id = p_ejec_id;
  END IF;

  -- Asiento contable
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

-- 7) Trigger: liquidación de coach aprobada → gasto auto
CREATE OR REPLACE FUNCTION public.sync_liquidacion_to_gasto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach record;
  v_existing_gasto record;
  v_total numeric;
  v_mes_label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_existing_gasto FROM public.gastos WHERE liquidacion_id = OLD.id;
    IF v_existing_gasto.id IS NOT NULL THEN
      IF v_existing_gasto.estado_conciliacion = 'conciliado' OR EXISTS (
        SELECT 1 FROM public.gastos_ejecucion_pagos WHERE gasto_id = v_existing_gasto.id
      ) THEN
        RAISE EXCEPTION 'No se puede eliminar la liquidación: ya tiene gasto pagado/conciliado asociado.';
      END IF;
      DELETE FROM public.gastos WHERE id = v_existing_gasto.id;
    END IF;
    RETURN OLD;
  END IF;

  v_total := COALESCE(NEW.total_confirmado, 0);
  SELECT * INTO v_coach FROM public.coaches WHERE id = NEW.coach_id;
  v_mes_label := NEW.mes;

  -- Si NO está aprobada/pagada: limpiar gasto si existe y no estaba pagado
  IF NEW.estado NOT IN ('aprobada','pagada') THEN
    SELECT * INTO v_existing_gasto FROM public.gastos WHERE liquidacion_id = NEW.id;
    IF v_existing_gasto.id IS NOT NULL
       AND v_existing_gasto.estado_conciliacion <> 'conciliado'
       AND NOT EXISTS (SELECT 1 FROM public.gastos_ejecucion_pagos WHERE gasto_id = v_existing_gasto.id) THEN
      DELETE FROM public.gastos WHERE id = v_existing_gasto.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Buscar gasto existente
  SELECT * INTO v_existing_gasto FROM public.gastos WHERE liquidacion_id = NEW.id;

  IF v_existing_gasto.id IS NULL THEN
    -- Crear gasto pendiente
    INSERT INTO public.gastos (
      categoria, subcategoria, descripcion, monto, moneda, fecha,
      forma_pago, proveedor, notas, liquidacion_id, origen_registro, estado_conciliacion
    ) VALUES (
      'Honorarios', 'liquidacion_coach',
      'Liquidación ' || v_mes_label || ' — ' || COALESCE(v_coach.nombre,'Coach'),
      v_total, 'ARS', CURRENT_DATE,
      'transferencia', v_coach.nombre,
      'Generado automáticamente desde liquidación aprobada.',
      NEW.id, 'liquidacion_auto', 'pendiente_conciliar'
    );
  ELSE
    -- Sincronizar monto si cambió y no está pagado
    IF v_existing_gasto.estado_conciliacion <> 'conciliado'
       AND NOT EXISTS (SELECT 1 FROM public.gastos_ejecucion_pagos WHERE gasto_id = v_existing_gasto.id)
       AND v_existing_gasto.monto <> v_total THEN
      UPDATE public.gastos
      SET monto = v_total, updated_at = now()
      WHERE id = v_existing_gasto.id;
    END IF;
    -- Si la liquidación pasó a 'pagada', marcar gasto como conciliado
    IF NEW.estado = 'pagada' AND v_existing_gasto.estado_conciliacion <> 'conciliado' THEN
      UPDATE public.gastos
      SET estado_conciliacion = 'conciliado', fecha = COALESCE(NEW.fecha_pago::date, CURRENT_DATE), updated_at = now()
      WHERE id = v_existing_gasto.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_liquidacion_to_gasto ON public.liquidaciones_mensuales;
CREATE TRIGGER trg_sync_liquidacion_to_gasto
AFTER INSERT OR UPDATE OR DELETE ON public.liquidaciones_mensuales
FOR EACH ROW EXECUTE FUNCTION public.sync_liquidacion_to_gasto();
