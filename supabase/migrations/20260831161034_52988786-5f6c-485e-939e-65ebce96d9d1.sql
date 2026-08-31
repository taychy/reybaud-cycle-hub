-- =========================================================
-- 1) aplicar_cambio_serie_grupal: preservar campos no enviados
-- =========================================================
CREATE OR REPLACE FUNCTION public.aplicar_cambio_serie_grupal(
  p_serie_id uuid,
  p_alcance text,               -- 'solo_fecha' | 'desde_fecha' | 'toda_serie'
  p_fecha_efectiva date,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_serie public.agenda_grupal%ROWTYPE;
  v_new_id uuid;
  v_p jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_coach uuid; v_sede uuid; v_dia int; v_hi time; v_hf time;
  v_grupo text; v_hon uuid; v_notas text;
  v_vd date; v_vh date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_serie FROM public.agenda_grupal WHERE id = p_serie_id;
  IF v_serie.id IS NULL THEN RAISE EXCEPTION 'La clase no existe.'; END IF;

  -- Solo se pisa lo que viene explícito en el payload; el resto se preserva.
  v_coach := COALESCE(NULLIF(v_p->>'coach_id','')::uuid, v_serie.coach_id);
  v_sede  := CASE WHEN v_p ? 'sede_id' THEN NULLIF(v_p->>'sede_id','')::uuid ELSE v_serie.sede_id END;
  v_dia   := COALESCE(NULLIF(v_p->>'dia_semana','')::int, v_serie.dia_semana);
  v_hi    := COALESCE(NULLIF(v_p->>'hora_inicio','')::time, v_serie.hora_inicio);
  v_hf    := COALESCE(NULLIF(v_p->>'hora_fin','')::time, v_serie.hora_fin);
  v_grupo := COALESCE(NULLIF(v_p->>'grupo',''), v_serie.grupo);
  v_hon   := CASE WHEN v_p ? 'honorario_id' THEN NULLIF(v_p->>'honorario_id','')::uuid ELSE v_serie.honorario_id END;
  v_notas := CASE WHEN v_p ? 'notas' THEN NULLIF(v_p->>'notas','') ELSE v_serie.notas END;
  v_vd    := CASE WHEN v_p ? 'vigente_desde' THEN NULLIF(v_p->>'vigente_desde','')::date ELSE v_serie.vigente_desde END;
  v_vh    := CASE WHEN v_p ? 'vigente_hasta' THEN NULLIF(v_p->>'vigente_hasta','')::date ELSE v_serie.vigente_hasta END;

  IF v_hf <= v_hi THEN RAISE EXCEPTION 'La hora de fin debe ser posterior al inicio.'; END IF;

  IF p_alcance = 'solo_fecha' THEN
    IF p_fecha_efectiva IS NULL THEN RAISE EXCEPTION 'Falta la fecha de la clase a modificar.'; END IF;
    -- La ocurrencia original deja de generarse; se crea una clase puntual en su lugar.
    UPDATE public.agenda_grupal
       SET fechas_excluidas = (
             SELECT ARRAY(SELECT DISTINCT x
                          FROM unnest(COALESCE(fechas_excluidas, '{}'::date[]) || p_fecha_efectiva) AS x
                          ORDER BY x)
           ),
           updated_at = now()
     WHERE id = p_serie_id;

    INSERT INTO public.agenda_grupal (
      coach_id, sede_id, dia_semana, hora_inicio, hora_fin, grupo, honorario_id, notas,
      activo, tipo_clase, fecha, serie_origen_id
    ) VALUES (
      v_coach, v_sede, EXTRACT(DOW FROM p_fecha_efectiva)::int, v_hi, v_hf, v_grupo, v_hon, v_notas,
      true, 'puntual', p_fecha_efectiva, p_serie_id
    ) RETURNING id INTO v_new_id;
    RETURN v_new_id;

  ELSIF p_alcance = 'desde_fecha' THEN
    IF p_fecha_efectiva IS NULL THEN RAISE EXCEPTION 'Falta la fecha desde la cual aplicar el cambio.'; END IF;
    UPDATE public.agenda_grupal
       SET vigente_hasta = p_fecha_efectiva - 1, updated_at = now()
     WHERE id = p_serie_id;

    INSERT INTO public.agenda_grupal (
      coach_id, sede_id, dia_semana, hora_inicio, hora_fin, grupo, honorario_id, notas,
      activo, tipo_clase, vigente_desde, vigente_hasta, fechas_excluidas, serie_origen_id
    ) VALUES (
      v_coach, v_sede, v_dia, v_hi, v_hf, v_grupo, v_hon, v_notas,
      true, 'recurrente', p_fecha_efectiva, v_serie.vigente_hasta,
      ARRAY(SELECT x FROM unnest(COALESCE(v_serie.fechas_excluidas,'{}'::date[])) AS x WHERE x >= p_fecha_efectiva),
      p_serie_id
    ) RETURNING id INTO v_new_id;
    RETURN v_new_id;

  ELSIF p_alcance = 'toda_serie' THEN
    UPDATE public.agenda_grupal
       SET coach_id = v_coach, sede_id = v_sede, dia_semana = v_dia,
           hora_inicio = v_hi, hora_fin = v_hf, grupo = v_grupo,
           honorario_id = v_hon, notas = v_notas,
           vigente_desde = v_vd, vigente_hasta = v_vh,
           updated_at = now()
     WHERE id = p_serie_id;
    RETURN p_serie_id;
  END IF;

  RAISE EXCEPTION 'Alcance inválido: %', p_alcance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_cambio_serie_grupal(uuid, text, date, jsonb) TO authenticated;

-- =========================================================
-- 2) Solicitudes de cambio PUNTUAL de disponibilidad (disponibilidad_ajustada)
-- =========================================================
CREATE OR REPLACE FUNCTION public.resolver_solicitud_agenda(
  p_solicitud_id uuid,
  p_aprobar boolean,
  p_respuesta text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.agenda_solicitudes%ROWTYPE;
  v jsonb;
  v_sede uuid;
  v_sv uuid;
  v_ids uuid[];
  v_tipo_aj text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO s FROM public.agenda_solicitudes WHERE id = p_solicitud_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'La solicitud no existe.'; END IF;
  IF s.estado <> 'pendiente' THEN RAISE EXCEPTION 'La solicitud ya fue resuelta.'; END IF;

  v := COALESCE(s.valores_nuevos, '{}'::jsonb);
  v_sede := NULLIF(v->>'sede_id','')::uuid;

  IF p_aprobar THEN
    IF s.tipo = 'grupal_crear' THEN
      INSERT INTO public.agenda_grupal (
        coach_id, sede_id, dia_semana, hora_inicio, hora_fin, grupo, honorario_id, notas,
        activo, tipo_clase, fecha, vigente_desde, vigente_hasta
      ) VALUES (
        s.coach_id, v_sede,
        COALESCE(NULLIF(v->>'dia_semana','')::int,
                 EXTRACT(DOW FROM COALESCE(NULLIF(v->>'fecha','')::date, CURRENT_DATE))::int),
        (v->>'hora_inicio')::time, (v->>'hora_fin')::time,
        COALESCE(NULLIF(v->>'grupo',''), 'G1'),
        NULLIF(v->>'honorario_id','')::uuid, NULLIF(v->>'notas',''),
        true, COALESCE(NULLIF(v->>'tipo_clase',''), 'recurrente'),
        NULLIF(v->>'fecha','')::date,
        NULLIF(v->>'vigente_desde','')::date, NULLIF(v->>'vigente_hasta','')::date
      );

    ELSIF s.tipo = 'grupal_editar' THEN
      PERFORM public.aplicar_cambio_serie_grupal(
        s.entidad_id, COALESCE(s.alcance, 'toda_serie'), s.fecha_efectiva, v);

    ELSIF s.tipo = 'grupal_finalizar' THEN
      UPDATE public.agenda_grupal
         SET vigente_hasta = COALESCE(s.fecha_efectiva, CURRENT_DATE), updated_at = now()
       WHERE id = s.entidad_id;

    ELSIF s.tipo = 'grupal_eliminar' THEN
      UPDATE public.agenda_grupal SET activo = false, updated_at = now() WHERE id = s.entidad_id;

    ELSIF s.tipo IN ('disp_crear','disp_editar') THEN
      IF s.tipo = 'disp_editar' AND v ? 'row_ids' THEN
        v_ids := ARRAY(SELECT (jsonb_array_elements_text(v->'row_ids'))::uuid);
        DELETE FROM public.disponibilidad_coaches WHERE id = ANY (v_ids) AND coach_id = s.coach_id;
      END IF;
      FOR v_sv IN SELECT (jsonb_array_elements_text(v->'servicio_ids'))::uuid LOOP
        INSERT INTO public.disponibilidad_coaches (coach_id, servicio_id, sede_id, dia_semana, hora_inicio, hora_fin)
        VALUES (s.coach_id, v_sv, v_sede, (v->>'dia_semana')::int, (v->>'hora_inicio')::time, (v->>'hora_fin')::time);
      END LOOP;

    ELSIF s.tipo = 'disp_eliminar' THEN
      v_ids := ARRAY(SELECT (jsonb_array_elements_text(v->'row_ids'))::uuid);
      DELETE FROM public.disponibilidad_coaches WHERE id = ANY (v_ids) AND coach_id = s.coach_id;

    -- Cambio PUNTUAL en una fecha concreta: reutiliza disponibilidad_ajustada.
    ELSIF s.tipo = 'ajuste_crear' THEN
      v_tipo_aj := COALESCE(NULLIF(v->>'tipo_ajuste',''), 'bloquear');
      IF v_tipo_aj NOT IN ('bloquear','reemplazar','agregar') THEN
        RAISE EXCEPTION 'Tipo de ajuste inválido: %', v_tipo_aj;
      END IF;
      IF COALESCE(s.fecha_efectiva, NULLIF(v->>'fecha','')::date) IS NULL THEN
        RAISE EXCEPTION 'La solicitud no tiene fecha.';
      END IF;
      INSERT INTO public.disponibilidad_ajustada (coach_id, fecha, tipo, hora_inicio, hora_fin, motivo)
      VALUES (
        s.coach_id,
        COALESCE(s.fecha_efectiva, NULLIF(v->>'fecha','')::date),
        v_tipo_aj,
        CASE WHEN v_tipo_aj = 'bloquear' THEN NULL ELSE (v->>'hora_inicio')::time END,
        CASE WHEN v_tipo_aj = 'bloquear' THEN NULL ELSE (v->>'hora_fin')::time END,
        NULLIF(btrim(COALESCE(s.motivo,'')), '')
      );

    ELSIF s.tipo = 'ajuste_eliminar' THEN
      DELETE FROM public.disponibilidad_ajustada
       WHERE id = s.entidad_id AND coach_id = s.coach_id;

    ELSE
      RAISE EXCEPTION 'Tipo de solicitud desconocido: %', s.tipo;
    END IF;
  END IF;

  UPDATE public.agenda_solicitudes
     SET estado = CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
         respuesta_admin = NULLIF(btrim(COALESCE(p_respuesta,'')), ''),
         resuelto_por = auth.uid(),
         resuelto_at = now()
   WHERE id = p_solicitud_id;

  UPDATE public.tareas
     SET estado = 'hecha',
         cerrada_por = auth.uid(),
         cerrada_at = now(),
         nota_cierre = CASE WHEN p_aprobar THEN 'Solicitud aprobada' ELSE 'Solicitud rechazada' END
   WHERE dedupe_key = 'agenda_sol_' || p_solicitud_id::text
     AND estado <> 'hecha';
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_solicitud_agenda(uuid, boolean, text) TO authenticated;

-- =========================================================
-- 3) solicitar_cambio_agenda: validar tipos y snapshot del ajuste puntual
-- =========================================================
CREATE OR REPLACE FUNCTION public.solicitar_cambio_agenda(
  p_tipo text,
  p_entidad_tipo text,
  p_entidad_id uuid,
  p_alcance text,
  p_fecha_efectiva date,
  p_valores_nuevos jsonb,
  p_motivo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coach public.coaches%ROWTYPE;
  v_prev jsonb := '{}'::jsonb;
  v_id uuid;
  v_titulo text;
BEGIN
  SELECT * INTO v_coach FROM public.coaches WHERE user_id = auth.uid() LIMIT 1;
  IF v_coach.id IS NULL THEN RAISE EXCEPTION 'Solo un profesor puede solicitar cambios de agenda.'; END IF;

  IF p_tipo NOT IN ('grupal_crear','grupal_editar','grupal_finalizar','grupal_eliminar',
                    'disp_crear','disp_editar','disp_eliminar',
                    'ajuste_crear','ajuste_eliminar') THEN
    RAISE EXCEPTION 'Tipo de solicitud inválido: %', p_tipo;
  END IF;

  IF p_entidad_tipo = 'agenda_grupal' AND p_entidad_id IS NOT NULL THEN
    SELECT to_jsonb(g) INTO v_prev FROM public.agenda_grupal g WHERE g.id = p_entidad_id;
    IF v_prev IS NULL OR (v_prev->>'coach_id')::uuid <> v_coach.id THEN
      RAISE EXCEPTION 'Esa clase no te pertenece.';
    END IF;
  ELSIF p_entidad_tipo = 'disponibilidad_ajustada' AND p_entidad_id IS NOT NULL THEN
    SELECT to_jsonb(a) INTO v_prev FROM public.disponibilidad_ajustada a WHERE a.id = p_entidad_id;
    IF v_prev IS NULL OR COALESCE((v_prev->>'coach_id')::uuid, '00000000-0000-0000-0000-000000000000') <> v_coach.id THEN
      RAISE EXCEPTION 'Ese ajuste no te pertenece.';
    END IF;
  ELSIF p_entidad_tipo = 'disponibilidad' AND p_valores_nuevos ? 'row_ids' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_prev
      FROM public.disponibilidad_coaches d
     WHERE d.id = ANY (ARRAY(SELECT (jsonb_array_elements_text(p_valores_nuevos->'row_ids'))::uuid))
       AND d.coach_id = v_coach.id;
    v_prev := jsonb_build_object('rows', v_prev);
  END IF;

  INSERT INTO public.agenda_solicitudes (
    coach_id, solicitado_por, tipo, alcance, entidad_tipo, entidad_id,
    valores_anteriores, valores_nuevos, fecha_efectiva, motivo
  ) VALUES (
    v_coach.id, auth.uid(), p_tipo, p_alcance, p_entidad_tipo, p_entidad_id,
    COALESCE(v_prev, '{}'::jsonb), COALESCE(p_valores_nuevos, '{}'::jsonb), p_fecha_efectiva,
    NULLIF(btrim(COALESCE(p_motivo,'')), '')
  ) RETURNING id INTO v_id;

  v_titulo := 'Agenda · ' || COALESCE(v_coach.nombre, 'Profesor') || ' solicita un cambio';

  INSERT INTO public.tareas (
    tipo, origen, titulo, descripcion, rol_destino, entidad_tipo, entidad_id,
    prioridad, estado, dedupe_key, metadata, created_by
  ) VALUES (
    'automatica', 'agenda_solicitud', v_titulo,
    COALESCE(p_motivo, 'Solicitud de cambio de agenda pendiente de aprobación.'),
    'admin', 'agenda_solicitud', v_id::text,
    'media', 'pendiente', 'agenda_sol_' || v_id::text,
    jsonb_build_object('solicitud_id', v_id, 'coach_id', v_coach.id, 'tipo', p_tipo, 'alcance', p_alcance),
    auth.uid()
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.solicitar_cambio_agenda(text, text, uuid, text, date, jsonb, text) TO authenticated;