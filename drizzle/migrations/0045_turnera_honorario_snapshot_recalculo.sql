CREATE OR REPLACE FUNCTION public._turnera_calcular_movimiento(p_servicio_id uuid, OUT o_tipo text, OUT o_valor numeric, OUT o_total numeric, OUT o_estado text, OUT o_obs text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_serv record; v_hon record; v_calc record;
BEGIN
  SELECT * INTO v_serv FROM public.servicios_turnera WHERE id = p_servicio_id;
  o_tipo := COALESCE(NULLIF(v_serv.tipo_actividad,''), 'personalizada');
  o_valor := 0; o_total := 0; o_estado := 'pendiente_revision';
  IF v_serv.honorario_id IS NOT NULL THEN
    SELECT id, COALESCE(valor,0) AS valor INTO v_hon FROM public.honorarios WHERE id = v_serv.honorario_id;
  END IF;
  IF v_hon.id IS NULL THEN
    o_obs := 'Honorario del profesor no configurado en el servicio de Turnera'; RETURN;
  END IF;
  o_valor := v_hon.valor;
  IF o_valor <= 0 THEN
    o_obs := 'Honorario configurado con valor $0'; RETURN;
  END IF;
  SELECT * INTO v_calc FROM public.aplicar_regla_liquidacion(o_tipo, 'realizada', o_valor);
  o_total := COALESCE(v_calc.total,0); o_estado := v_calc.estado_economico; o_obs := v_calc.nota;
  IF o_estado = 'liquidable' AND o_total <= 0 THEN
    o_estado := 'pendiente_revision'; o_obs := 'Total calculado $0: revisar regla de liquidación';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generar_movimiento_turnera()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v_dur int; v_serv_dur int;
BEGIN
  IF NEW.estado_operativo IS DISTINCT FROM 'realizada' OR NEW.coach_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_liquidacion WHERE reserva_turnera_id = NEW.id) THEN RETURN NEW; END IF;
  SELECT * INTO v_c FROM public._turnera_calcular_movimiento(NEW.servicio_id);
  SELECT duracion_minutos INTO v_serv_dur FROM public.servicios_turnera WHERE id = NEW.servicio_id;
  v_dur := COALESCE(v_serv_dur, GREATEST(0, EXTRACT(EPOCH FROM (NEW.hora_fin - NEW.hora_inicio))/60)::int);
  INSERT INTO public.movimientos_liquidacion (
    coach_id, fecha, tipo_actividad, origen, alumno_id, nombre_externo, sede_id, duracion,
    valor_base, total, estado_operativo, estado_economico, observaciones, reserva_turnera_id
  ) VALUES (
    NEW.coach_id, NEW.fecha, v_c.o_tipo, 'turnera', NEW.alumno_id,
    NULLIF(TRIM(COALESCE(NEW.nombre,'') || ' ' || COALESCE(NEW.apellido,'')), ''),
    NEW.sede_id, NULLIF(v_dur,0), v_c.o_valor, v_c.o_total, 'realizada', v_c.o_estado, v_c.o_obs, NEW.id
  ) ON CONFLICT (reserva_turnera_id) WHERE reserva_turnera_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;

-- Recalcula solo movimientos de turnera en $0, sin liquidación mensual aprobada/pagada.
-- Nunca toca movimientos con total > 0, liquidados ni no_liquidable.
CREATE OR REPLACE FUNCTION public.recalcular_movimientos_turnera(p_coach_id uuid DEFAULT NULL, p_dry_run boolean DEFAULT true)
RETURNS TABLE(movimiento_id uuid, fecha date, total_anterior numeric, total_nuevo numeric, estado_nuevo text, aplicado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_c record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  FOR r IN
    SELECT m.id, m.fecha, m.total, rt.servicio_id
    FROM public.movimientos_liquidacion m
    JOIN public.reservas_turnera rt ON rt.id = m.reserva_turnera_id
    LEFT JOIN public.liquidaciones_mensuales l ON l.id = m.liquidacion_mensual_id
    WHERE m.origen = 'turnera' AND COALESCE(m.total,0) = 0
      AND m.estado_economico IN ('pendiente_revision','liquidable')
      AND (l.id IS NULL OR l.estado NOT IN ('aprobada','pagada'))
      AND (p_coach_id IS NULL OR m.coach_id = p_coach_id)
    FOR UPDATE OF m
  LOOP
    SELECT * INTO v_c FROM public._turnera_calcular_movimiento(r.servicio_id);
    IF NOT p_dry_run THEN
      UPDATE public.movimientos_liquidacion SET valor_base = v_c.o_valor, total = v_c.o_total,
        estado_economico = v_c.o_estado, observaciones = v_c.o_obs, updated_at = now()
      WHERE id = r.id;
    END IF;
    movimiento_id := r.id; fecha := r.fecha; total_anterior := COALESCE(r.total,0);
    total_nuevo := v_c.o_total; estado_nuevo := v_c.o_estado; aplicado := NOT p_dry_run;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public._turnera_calcular_movimiento(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_movimientos_turnera(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalcular_movimientos_turnera(uuid, boolean) TO authenticated;