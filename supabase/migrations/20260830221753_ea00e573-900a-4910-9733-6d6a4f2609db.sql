CREATE OR REPLACE FUNCTION public.generar_movimiento_turnera()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_serv record;
  v_hon_id uuid;
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
    SELECT id, COALESCE(valor,0) INTO v_hon_id, v_valor
    FROM public.honorarios WHERE id = v_serv.honorario_id;
  END IF;

  IF v_hon_id IS NULL THEN
    v_valor := 0;
    v_total := 0;
    v_estado := 'pendiente_revision';
    v_obs := 'Honorario del profesor no configurado en el servicio de Turnera';
  ELSE
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
    v_valor, v_total,
    'realizada', v_estado, v_obs, NEW.id
  )
  ON CONFLICT (reserva_turnera_id) WHERE reserva_turnera_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$;