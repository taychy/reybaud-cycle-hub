CREATE OR REPLACE FUNCTION public.confirmar_clase_grupal(p_agenda_id uuid, p_fecha date, p_foto_url text DEFAULT NULL::text, p_notas text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agenda record;
  v_is_admin boolean;
  v_coach_user uuid;
  v_clase record;
  v_valor numeric := 0;
  v_hon_id uuid;
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
    SELECT id, COALESCE(valor,0) INTO v_hon_id, v_valor
    FROM public.honorarios WHERE id = v_agenda.honorario_id;
  END IF;

  IF v_hon_id IS NULL THEN
    v_valor := 0;
    v_total := 0;
    v_estado := 'pendiente_revision';
    v_obs := 'Honorario no configurado en la agenda grupal';
  ELSE
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
    v_valor, v_total, 'realizada', v_estado, v_obs
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
$function$;

REVOKE ALL ON FUNCTION public.confirmar_clase_grupal(uuid,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_clase_grupal(uuid,date,text,text) TO authenticated;