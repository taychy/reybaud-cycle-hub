-- ============================================================
-- Rediseño funcional de Liquidaciones
-- ============================================================

-- 1) Honorario del profesor en servicios de Turnera
ALTER TABLE public.servicios_turnera
  ADD COLUMN IF NOT EXISTS honorario_id uuid REFERENCES public.honorarios(id) ON DELETE SET NULL;

-- 2) Idempotencia estructural
CREATE UNIQUE INDEX IF NOT EXISTS uniq_clases_dictadas_agenda_fecha
  ON public.clases_dictadas (agenda_id, fecha)
  WHERE agenda_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_mov_liq_reserva_turnera
  ON public.movimientos_liquidacion (reserva_turnera_id)
  WHERE reserva_turnera_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mov_liq_coach_fecha
  ON public.movimientos_liquidacion (coach_id, fecha);

CREATE INDEX IF NOT EXISTS idx_mov_liq_estado_economico
  ON public.movimientos_liquidacion (estado_economico);

-- 3) Helper: aplicar regla de liquidación
CREATE OR REPLACE FUNCTION public.aplicar_regla_liquidacion(
  p_tipo_actividad text,
  p_estado_operativo text,
  p_valor_base numeric
) RETURNS TABLE (total numeric, estado_economico text, nota text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_regla record;
BEGIN
  SELECT * INTO v_regla
  FROM public.reglas_liquidacion
  WHERE tipo_actividad = p_tipo_actividad
    AND estado_operativo = p_estado_operativo
  LIMIT 1;

  IF v_regla IS NULL THEN
    RETURN QUERY SELECT 0::numeric, 'pendiente_revision'::text, 'Regla de liquidación no configurada'::text;
    RETURN;
  END IF;

  IF NOT v_regla.liquida THEN
    RETURN QUERY SELECT 0::numeric, 'no_liquidable'::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    ROUND(COALESCE(p_valor_base,0) * COALESCE(v_regla.porcentaje_pago,100) / 100.0, 2),
    'liquidable'::text,
    NULL::text;
END;
$$;

-- 4) Confirmar clase grupal (coach) -> clase + movimiento, idempotente
CREATE OR REPLACE FUNCTION public.confirmar_clase_grupal(
  p_agenda_id uuid,
  p_fecha date,
  p_foto_url text DEFAULT NULL,
  p_notas text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agenda record;
  v_is_admin boolean;
  v_coach_user uuid;
  v_clase record;
  v_valor numeric := 0;
  v_hon record;
  v_tipo text;
  v_dur int;
  v_calc record;
  v_estado text;
  v_total numeric;
  v_obs text;
  v_mov_id uuid;
  v_clase_id uuid;
BEGIN
  SELECT * INTO v_agenda FROM public.agenda_grupal WHERE id = p_agenda_id;
  IF v_agenda IS NULL THEN RAISE EXCEPTION 'Bloque de agenda inexistente'; END IF;

  v_is_admin := public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid());
  SELECT user_id INTO v_coach_user FROM public.coaches WHERE id = v_agenda.coach_id;
  IF NOT v_is_admin AND (v_coach_user IS NULL OR v_coach_user <> auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Serializa confirmaciones concurrentes de la misma clase
  PERFORM pg_advisory_xact_lock(hashtext('clase_grupal:' || p_agenda_id::text || ':' || p_fecha::text));

  SELECT * INTO v_clase
  FROM public.clases_dictadas
  WHERE agenda_id = p_agenda_id AND fecha = p_fecha;

  IF v_clase.id IS NOT NULL THEN
    UPDATE public.clases_dictadas
    SET foto_grupal_url = COALESCE(foto_grupal_url, p_foto_url),
        notas = COALESCE(notas, p_notas),
        updated_at = now()
    WHERE id = v_clase.id;
    RETURN v_clase.id;
  END IF;

  v_dur := GREATEST(0, EXTRACT(EPOCH FROM (v_agenda.hora_fin - v_agenda.hora_inicio))/60)::int;
  v_tipo := CASE WHEN v_dur >= 120 THEN 'grupal_2h' ELSE 'grupal_1h30' END;

  IF v_agenda.honorario_id IS NOT NULL THEN
    SELECT * INTO v_hon FROM public.honorarios WHERE id = v_agenda.honorario_id;
  END IF;

  IF v_hon.id IS NULL THEN
    v_total := 0;
    v_estado := 'pendiente_revision';
    v_obs := 'Honorario no configurado en la agenda grupal';
  ELSE
    v_valor := COALESCE(v_hon.valor, 0);
    SELECT * INTO v_calc FROM public.aplicar_regla_liquidacion(v_tipo, 'realizada', v_valor);
    v_total := v_calc.total;
    v_estado := v_calc.estado_economico;
    v_obs := v_calc.nota;
  END IF;

  INSERT INTO public.movimientos_liquidacion (
    coach_id, fecha, tipo_actividad, origen, grupo, sede_id, duracion,
    valor_base, total, estado_operativo, estado_economico, observaciones
  ) VALUES (
    v_agenda.coach_id, p_fecha, v_tipo, 'agenda_admin', v_agenda.grupo, v_agenda.sede_id, NULLIF(v_dur,0),
    CASE WHEN v_hon.id IS NULL THEN 0 ELSE v_valor END,
    v_total, 'realizada', v_estado, v_obs
  ) RETURNING id INTO v_mov_id;

  INSERT INTO public.clases_dictadas (
    coach_id, agenda_id, movimiento_id, sede_id, honorario_id,
    fecha, hora_inicio, hora_fin, foto_grupal_url, notas
  ) VALUES (
    v_agenda.coach_id, p_agenda_id, v_mov_id, v_agenda.sede_id, v_agenda.honorario_id,
    p_fecha, v_agenda.hora_inicio, v_agenda.hora_fin, p_foto_url, p_notas
  ) RETURNING id INTO v_clase_id;

  RETURN v_clase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_clase_grupal(uuid,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_clase_grupal(uuid,date,text,text) TO authenticated;

-- 5) Turnera realizada -> movimiento de liquidación (trigger, idempotente)
CREATE OR REPLACE FUNCTION public.generar_movimiento_turnera()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serv record;
  v_hon record;
  v_tipo text;
  v_valor numeric := 0;
  v_calc record;
  v_total numeric;
  v_estado text;
  v_obs text;
  v_dur int;
BEGIN
  IF NEW.estado_operativo IS DISTINCT FROM 'realizada' THEN RETURN NEW; END IF;
  IF NEW.coach_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_liquidacion WHERE reserva_turnera_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_serv FROM public.servicios_turnera WHERE id = NEW.servicio_id;
  v_tipo := COALESCE(NULLIF(v_serv.tipo_actividad,''), 'personalizada');
  v_dur := COALESCE(v_serv.duracion_minutos,
                    GREATEST(0, EXTRACT(EPOCH FROM (NEW.hora_fin - NEW.hora_inicio))/60)::int);

  IF v_serv.honorario_id IS NOT NULL THEN
    SELECT * INTO v_hon FROM public.honorarios WHERE id = v_serv.honorario_id;
  END IF;

  IF v_hon.id IS NULL THEN
    v_total := 0;
    v_estado := 'pendiente_revision';
    v_obs := 'Honorario del profesor no configurado en el servicio de Turnera';
  ELSE
    v_valor := COALESCE(v_hon.valor, 0);
    SELECT * INTO v_calc FROM public.aplicar_regla_liquidacion(v_tipo, 'realizada', v_valor);
    v_total := v_calc.total;
    v_estado := v_calc.estado_economico;
    v_obs := v_calc.nota;
  END IF;

  INSERT INTO public.movimientos_liquidacion (
    coach_id, fecha, tipo_actividad, origen, alumno_id, nombre_externo,
    sede_id, duracion, valor_base, total,
    estado_operativo, estado_economico, observaciones, reserva_turnera_id
  ) VALUES (
    NEW.coach_id, NEW.fecha, v_tipo, 'turnera', NEW.alumno_id,
    NULLIF(TRIM(COALESCE(NEW.nombre,'') || ' ' || COALESCE(NEW.apellido,'')), ''),
    NEW.sede_id, NULLIF(v_dur,0),
    CASE WHEN v_hon.id IS NULL THEN 0 ELSE v_valor END, v_total,
    'realizada', v_estado, v_obs, NEW.id
  )
  ON CONFLICT (reserva_turnera_id) WHERE reserva_turnera_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_turnera_movimiento_liquidacion ON public.reservas_turnera;
CREATE TRIGGER trg_turnera_movimiento_liquidacion
AFTER INSERT OR UPDATE OF estado_operativo ON public.reservas_turnera
FOR EACH ROW EXECUTE FUNCTION public.generar_movimiento_turnera();

-- 6) Coach marca turno como realizado
CREATE OR REPLACE FUNCTION public.marcar_reserva_turnera_realizada(p_reserva_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res record;
  v_coach_user uuid;
BEGIN
  SELECT * INTO v_res FROM public.reservas_turnera WHERE id = p_reserva_id;
  IF v_res IS NULL THEN RAISE EXCEPTION 'Reserva inexistente'; END IF;

  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    SELECT user_id INTO v_coach_user FROM public.coaches WHERE id = v_res.coach_id;
    IF v_coach_user IS NULL OR v_coach_user <> auth.uid() THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;
  END IF;

  IF v_res.estado_operativo = 'realizada' THEN RETURN; END IF;
  IF COALESCE(v_res.estado_operativo,'') LIKE 'cancelada%' THEN
    RAISE EXCEPTION 'La reserva está cancelada';
  END IF;

  UPDATE public.reservas_turnera
  SET estado_operativo = 'realizada', updated_at = now()
  WHERE id = p_reserva_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_reserva_turnera_realizada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_reserva_turnera_realizada(uuid) TO authenticated;

-- 7) Carga manual del coach: SIEMPRE pendiente_revision
CREATE OR REPLACE FUNCTION public.cargar_clase_manual_coach(
  p_fecha date,
  p_tipo_actividad text,
  p_honorario_id uuid DEFAULT NULL,
  p_grupo text DEFAULT NULL,
  p_nombre_externo text DEFAULT NULL,
  p_observaciones text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_valor numeric := 0;
  v_obs text := p_observaciones;
  v_id uuid;
BEGIN
  SELECT id INTO v_coach_id FROM public.coaches WHERE user_id = auth.uid();
  IF v_coach_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  IF p_honorario_id IS NOT NULL THEN
    SELECT COALESCE(valor,0) INTO v_valor FROM public.honorarios WHERE id = p_honorario_id;
  END IF;

  IF COALESCE(v_valor,0) = 0 THEN
    v_valor := 0;
    v_obs := COALESCE(NULLIF(v_obs,'') || ' · ', '') || 'Sin honorario seleccionado — requiere revisión de Admin';
  END IF;

  INSERT INTO public.movimientos_liquidacion (
    coach_id, fecha, tipo_actividad, origen, grupo, nombre_externo,
    valor_base, total, estado_operativo, estado_economico, observaciones
  ) VALUES (
    v_coach_id, p_fecha, p_tipo_actividad, 'carga_coach',
    NULLIF(p_grupo,''), NULLIF(p_nombre_externo,''),
    v_valor, v_valor, 'realizada', 'pendiente_revision', v_obs
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cargar_clase_manual_coach(date,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cargar_clase_manual_coach(date,text,uuid,text,text,text) TO authenticated;

-- 8) Preparar / cerrar liquidación mensual (idempotente)
CREATE OR REPLACE FUNCTION public.preparar_liquidacion_mensual(p_coach_id uuid, p_mes text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini date;
  v_fin date;
  v_conf numeric;
  v_est numeric;
  v_liq record;
  v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Mes inválido (YYYY-MM)'; END IF;

  v_ini := (p_mes || '-01')::date;
  v_fin := (v_ini + interval '1 month - 1 day')::date;

  SELECT * INTO v_liq FROM public.liquidaciones_mensuales
   WHERE coach_id = p_coach_id AND mes = p_mes;

  IF v_liq.id IS NOT NULL AND v_liq.estado = 'pagada' THEN
    RETURN v_liq.id;
  END IF;

  SELECT
    COALESCE(SUM(total) FILTER (WHERE estado_economico IN ('liquidable','liquidada')), 0),
    COALESCE(SUM(total) FILTER (WHERE estado_operativo IN ('programada','reservada')), 0)
  INTO v_conf, v_est
  FROM public.movimientos_liquidacion
  WHERE coach_id = p_coach_id AND fecha BETWEEN v_ini AND v_fin;

  INSERT INTO public.liquidaciones_mensuales (coach_id, mes, total_confirmado, total_estimado, estado)
  VALUES (p_coach_id, p_mes, v_conf, v_est, 'en_revision')
  ON CONFLICT (coach_id, mes) DO UPDATE
    SET total_confirmado = EXCLUDED.total_confirmado,
        total_estimado = EXCLUDED.total_estimado,
        estado = CASE WHEN public.liquidaciones_mensuales.estado IN ('aprobada','pagada')
                      THEN public.liquidaciones_mensuales.estado ELSE 'en_revision' END,
        updated_at = now()
  RETURNING id INTO v_id;

  UPDATE public.movimientos_liquidacion
  SET liquidacion_mensual_id = v_id, updated_at = now()
  WHERE coach_id = p_coach_id
    AND fecha BETWEEN v_ini AND v_fin
    AND estado_economico IN ('liquidable','liquidada')
    AND liquidacion_mensual_id IS DISTINCT FROM v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_liquidacion_mensual(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preparar_liquidacion_mensual(uuid,text) TO authenticated;

-- 9) Pago de liquidación: reutiliza el gasto creado al aprobar, nunca duplica
CREATE OR REPLACE FUNCTION public.pay_liquidacion_coach(
  p_liquidacion_id uuid,
  p_coach_id uuid,
  p_mes text,
  p_monto numeric,
  p_moneda text DEFAULT 'ARS'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_nombre text;
  v_gasto record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido para liquidar: %', p_monto;
  END IF;

  SELECT nombre INTO v_coach_nombre FROM public.coaches WHERE id = p_coach_id;

  UPDATE public.liquidaciones_mensuales
     SET estado = 'pagada', fecha_pago = now(), total_pagado = p_monto, updated_at = now()
   WHERE id = p_liquidacion_id;

  SELECT * INTO v_gasto FROM public.gastos WHERE liquidacion_id = p_liquidacion_id LIMIT 1;

  IF v_gasto.id IS NULL THEN
    INSERT INTO public.gastos (
      fecha, descripcion, categoria, subcategoria, proveedor,
      monto, moneda, forma_pago, origen_registro,
      unidad_negocio, liquidacion_id, estado_conciliacion
    ) VALUES (
      CURRENT_DATE,
      'Liquidación ' || COALESCE(v_coach_nombre, p_coach_id::text) || ' - ' || p_mes,
      'Honorarios', 'liquidacion_coach', v_coach_nombre,
      p_monto, p_moneda, 'transferencia', 'liquidacion_coach',
      'escuela', p_liquidacion_id, 'conciliado'
    );
  ELSE
    UPDATE public.gastos
       SET monto = p_monto,
           estado_conciliacion = 'conciliado',
           updated_at = now()
     WHERE id = v_gasto.id
       AND NOT EXISTS (SELECT 1 FROM public.gastos_ejecucion_pagos WHERE gasto_id = v_gasto.id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_liquidacion_coach(uuid,uuid,text,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_liquidacion_coach(uuid,uuid,text,numeric,text) TO authenticated;

-- 10) Alertas de integridad para Admin
CREATE OR REPLACE FUNCTION public.get_liquidaciones_alertas()
RETURNS TABLE (
  pendientes_count integer,
  pendientes_monto numeric,
  pendientes_carga_coach integer,
  pendientes_sin_honorario integer,
  turnera_sin_movimiento integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.movimientos_liquidacion WHERE estado_economico = 'pendiente_revision'),
    (SELECT COALESCE(SUM(total),0) FROM public.movimientos_liquidacion WHERE estado_economico = 'pendiente_revision'),
    (SELECT count(*)::int FROM public.movimientos_liquidacion WHERE estado_economico = 'pendiente_revision' AND origen = 'carga_coach'),
    (SELECT count(*)::int FROM public.movimientos_liquidacion WHERE estado_economico = 'pendiente_revision' AND COALESCE(total,0) = 0),
    (SELECT count(*)::int FROM public.reservas_turnera r
      WHERE r.estado_operativo = 'realizada'
        AND NOT EXISTS (SELECT 1 FROM public.movimientos_liquidacion m WHERE m.reserva_turnera_id = r.id));
$$;

REVOKE ALL ON FUNCTION public.get_liquidaciones_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_liquidaciones_alertas() TO authenticated;