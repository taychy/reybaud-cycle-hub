-- =========================================================
-- 1) Clase puntual vs recurrente en agenda_grupal
-- =========================================================
ALTER TABLE public.agenda_grupal
  ADD COLUMN IF NOT EXISTS tipo_clase text NOT NULL DEFAULT 'recurrente',
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS serie_origen_id uuid,
  ADD COLUMN IF NOT EXISTS fechas_excluidas date[] NOT NULL DEFAULT '{}'::date[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_grupal_tipo_clase_chk') THEN
    ALTER TABLE public.agenda_grupal
      ADD CONSTRAINT agenda_grupal_tipo_clase_chk
      CHECK (tipo_clase IN ('recurrente','puntual') AND (tipo_clase = 'recurrente' OR fecha IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_grupal_serie_origen_fk') THEN
    ALTER TABLE public.agenda_grupal
      ADD CONSTRAINT agenda_grupal_serie_origen_fk
      FOREIGN KEY (serie_origen_id) REFERENCES public.agenda_grupal(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ¿La fila genera clase en esa fecha?
CREATE OR REPLACE FUNCTION public.agenda_grupal_ocurre(
  p_tipo_clase text, p_fecha_puntual date, p_dia_semana int,
  p_vigente_desde date, p_vigente_hasta date, p_excluidas date[], p_activo boolean,
  p_fecha date
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(p_activo, true)
     AND CASE
           WHEN COALESCE(p_tipo_clase,'recurrente') = 'puntual'
             THEN p_fecha_puntual = p_fecha
           ELSE p_dia_semana = EXTRACT(DOW FROM p_fecha)::int
                AND (p_vigente_desde IS NULL OR p_fecha >= p_vigente_desde)
                AND (p_vigente_hasta IS NULL OR p_fecha <= p_vigente_hasta)
                AND NOT (p_fecha = ANY (COALESCE(p_excluidas, '{}'::date[])))
         END;
$$;

-- Clase grupal del coach que se solapa con un horario concreto
CREATE OR REPLACE FUNCTION public.agenda_grupal_conflicto(
  p_coach_id uuid, p_fecha date, p_hora_inicio time, p_hora_fin time
) RETURNS TABLE (grupo text, hora_inicio time, hora_fin time)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT g.grupo, g.hora_inicio, g.hora_fin
  FROM public.agenda_grupal g
  WHERE g.coach_id = p_coach_id
    AND public.agenda_grupal_ocurre(g.tipo_clase, g.fecha, g.dia_semana, g.vigente_desde,
                                    g.vigente_hasta, g.fechas_excluidas, g.activo, p_fecha)
    AND p_hora_inicio < g.hora_fin
    AND p_hora_fin > g.hora_inicio
  ORDER BY g.hora_inicio
  LIMIT 1;
$$;

-- =========================================================
-- 2) Turnera: usar el chequeo consciente de vigencia/puntual
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_create_turnera_reservation(p_servicio_id uuid, p_coach_id uuid, p_sede_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_nombre text, p_apellido text, p_email text, p_celular text DEFAULT NULL::text, p_documento text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_alumno_id uuid DEFAULT NULL::uuid, p_precio numeric DEFAULT NULL::numeric, p_estado_economico text DEFAULT 'pendiente'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := gen_random_uuid();
  v_conflict record;
  v_grupal record;
  v_ausente boolean;
  v_moneda text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_servicio_id IS NULL OR p_coach_id IS NULL OR p_fecha IS NULL OR p_hora_inicio IS NULL OR p_hora_fin IS NULL THEN
    RAISE EXCEPTION 'Faltan datos obligatorios (servicio, profesor, fecha y horario).';
  END IF;

  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'La hora de fin debe ser posterior a la hora de inicio.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || p_fecha::text, 0));

  SELECT r.hora_inicio, r.hora_fin, r.nombre, r.apellido INTO v_conflict
  FROM public.reservas_turnera r
  WHERE r.coach_id = p_coach_id
    AND r.fecha = p_fecha
    AND COALESCE(r.estado_operativo, '') NOT LIKE 'cancelada%'
    AND p_hora_inicio < r.hora_fin
    AND p_hora_fin > r.hora_inicio
  ORDER BY r.hora_inicio LIMIT 1;

  IF v_conflict.hora_inicio IS NOT NULL THEN
    RAISE EXCEPTION 'El profesor ya tiene un turno de % a % (%).',
      to_char(v_conflict.hora_inicio, 'HH24:MI'),
      to_char(v_conflict.hora_fin, 'HH24:MI'),
      btrim(coalesce(v_conflict.nombre,'') || ' ' || coalesce(v_conflict.apellido,''));
  END IF;

  SELECT * INTO v_grupal FROM public.agenda_grupal_conflicto(p_coach_id, p_fecha, p_hora_inicio, p_hora_fin);

  IF v_grupal.hora_inicio IS NOT NULL THEN
    RAISE EXCEPTION 'El profesor tiene una clase grupal (%) de % a % ese día.',
      coalesce(v_grupal.grupo, 'grupo'),
      to_char(v_grupal.hora_inicio, 'HH24:MI'),
      to_char(v_grupal.hora_fin, 'HH24:MI');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ausencias_coaches x
    WHERE x.coach_id = p_coach_id
      AND p_fecha BETWEEN x.fecha_inicio AND x.fecha_fin
      AND (COALESCE(x.todo_el_dia, true) OR x.hora_inicio IS NULL OR x.hora_fin IS NULL
           OR (p_hora_inicio < x.hora_fin AND p_hora_fin > x.hora_inicio))
  ) INTO v_ausente;

  IF v_ausente THEN
    RAISE EXCEPTION 'El profesor tiene una ausencia registrada en ese horario.';
  END IF;

  SELECT COALESCE(s.moneda, 'ARS') INTO v_moneda FROM public.servicios_turnera s WHERE s.id = p_servicio_id;

  INSERT INTO public.reservas_turnera (
    id, servicio_id, coach_id, sede_id, alumno_id, fecha, hora_inicio, hora_fin,
    nombre, apellido, email, celular, documento, nota,
    acepto_politica, precio_snapshot, moneda_snapshot, origen_link, form_responses,
    estado_operativo, estado_economico, pago_monto
  ) VALUES (
    v_id, p_servicio_id, p_coach_id, p_sede_id, p_alumno_id, p_fecha, p_hora_inicio, p_hora_fin,
    btrim(p_nombre), btrim(p_apellido), btrim(p_email), p_celular, p_documento, p_nota,
    true, p_precio, COALESCE(v_moneda, 'ARS'), 'admin', '{}'::jsonb,
    'reservada', COALESCE(p_estado_economico, 'pendiente'),
    CASE WHEN p_estado_economico = 'pagado' THEN p_precio ELSE NULL END
  );

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_turnera_reservation(p_reservation_id uuid, p_servicio_id uuid, p_coach_id uuid, p_sede_id uuid, p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_nombre text, p_apellido text, p_email text, p_celular text, p_documento text, p_fecha_nacimiento date, p_nota text, p_acepto_politica boolean, p_origen_link text, p_form_responses jsonb DEFAULT '{}'::jsonb, p_alumno_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_precio numeric;
  v_moneda text;
  v_dur int;
  v_antic int;
  v_activo boolean;
  v_conflict boolean;
  v_dow int;
  v_has_block boolean;
  v_has_replace boolean;
  v_in_window boolean;
  v_ausente boolean;
  v_grupal record;
BEGIN
  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'Horario inválido.';
  END IF;

  SELECT precio, moneda, duracion_minutos, COALESCE(anticipacion_horas_minima, 24), COALESCE(activo, false)
    INTO v_precio, v_moneda, v_dur, v_antic, v_activo
  FROM public.servicios_turnera WHERE id = p_servicio_id;

  IF v_dur IS NULL OR NOT v_activo THEN
    RAISE EXCEPTION 'El servicio no está disponible.';
  END IF;

  IF EXTRACT(EPOCH FROM (p_hora_fin - p_hora_inicio)) / 60 <> v_dur THEN
    RAISE EXCEPTION 'La duración del turno no coincide con el servicio.';
  END IF;

  IF (p_fecha + p_hora_inicio) < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + make_interval(hours => v_antic)) THEN
    RAISE EXCEPTION 'Ese turno ya no cumple la anticipación mínima. Elegí otro turno.';
  END IF;

  v_dow := EXTRACT(DOW FROM p_fecha)::int;

  SELECT EXISTS (SELECT 1 FROM public.disponibilidad_ajustada a
                 WHERE a.fecha = p_fecha AND (a.coach_id IS NULL OR a.coach_id = p_coach_id)
                   AND a.tipo = 'bloquear')
    INTO v_has_block;
  IF v_has_block THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro turno.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.disponibilidad_ajustada a
                 WHERE a.fecha = p_fecha AND (a.coach_id IS NULL OR a.coach_id = p_coach_id)
                   AND a.tipo = 'reemplazar' AND a.hora_inicio IS NOT NULL AND a.hora_fin IS NOT NULL)
    INTO v_has_replace;

  SELECT EXISTS (
    SELECT 1 FROM public.disponibilidad_ajustada a
    WHERE a.fecha = p_fecha AND (a.coach_id IS NULL OR a.coach_id = p_coach_id)
      AND a.tipo IN ('reemplazar','agregar')
      AND a.hora_inicio IS NOT NULL AND a.hora_fin IS NOT NULL
      AND p_hora_inicio >= a.hora_inicio AND p_hora_fin <= a.hora_fin
  ) OR (
    NOT v_has_replace AND EXISTS (
      SELECT 1 FROM public.disponibilidad_coaches d
      WHERE d.coach_id = p_coach_id AND d.servicio_id = p_servicio_id
        AND d.dia_semana = v_dow AND COALESCE(d.activo, false)
        AND p_hora_inicio >= d.hora_inicio AND p_hora_fin <= d.hora_fin
        AND (p_sede_id IS NULL OR d.sede_id IS NULL OR d.sede_id = p_sede_id)
    )
  ) INTO v_in_window;

  IF NOT v_in_window THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro turno.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ausencias_coaches x
    WHERE x.coach_id = p_coach_id
      AND p_fecha BETWEEN x.fecha_inicio AND x.fecha_fin
      AND (COALESCE(x.todo_el_dia, true) OR x.hora_inicio IS NULL OR x.hora_fin IS NULL
           OR (p_hora_inicio < x.hora_fin AND p_hora_fin > x.hora_inicio))
  ) INTO v_ausente;
  IF v_ausente THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elegí otro turno.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || p_fecha::text, 0));

  SELECT * INTO v_grupal FROM public.agenda_grupal_conflicto(p_coach_id, p_fecha, p_hora_inicio, p_hora_fin);
  IF v_grupal.hora_inicio IS NOT NULL THEN
    RAISE EXCEPTION 'Ese horario coincide con otra actividad del coach. Elegí otro turno.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reservas_turnera r
    WHERE r.coach_id = p_coach_id
      AND r.fecha = p_fecha
      AND COALESCE(r.estado_operativo, '') NOT LIKE 'cancelada%'
      AND p_hora_inicio < r.hora_fin
      AND p_hora_fin > r.hora_inicio
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Ese horario acaba de ocuparse. Elegí otro turno.';
  END IF;

  INSERT INTO public.reservas_turnera (
    id, servicio_id, coach_id, sede_id, alumno_id, fecha, hora_inicio, hora_fin,
    nombre, apellido, email, celular, documento, fecha_nacimiento, nota,
    acepto_politica, precio_snapshot, moneda_snapshot, origen_link, form_responses
  ) VALUES (
    COALESCE(p_reservation_id, gen_random_uuid()), p_servicio_id, p_coach_id, p_sede_id, p_alumno_id,
    p_fecha, p_hora_inicio, p_hora_fin,
    p_nombre, p_apellido, p_email, p_celular, p_documento, p_fecha_nacimiento, p_nota,
    COALESCE(p_acepto_politica, false), v_precio, COALESCE(v_moneda, 'ARS'), p_origen_link,
    COALESCE(p_form_responses, '{}'::jsonb)
  );

  RETURN COALESCE(p_reservation_id, (SELECT id FROM public.reservas_turnera WHERE id = p_reservation_id));
END;
$function$;

-- =========================================================
-- 3) Alcance de cambios sobre una serie recurrente
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
  v_coach uuid; v_sede uuid; v_dia int; v_hi time; v_hf time;
  v_grupo text; v_hon uuid; v_notas text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_serie FROM public.agenda_grupal WHERE id = p_serie_id;
  IF v_serie.id IS NULL THEN RAISE EXCEPTION 'La clase no existe.'; END IF;

  v_coach := COALESCE(NULLIF(p_payload->>'coach_id','')::uuid, v_serie.coach_id);
  v_sede  := NULLIF(p_payload->>'sede_id','')::uuid;
  v_dia   := COALESCE(NULLIF(p_payload->>'dia_semana','')::int, v_serie.dia_semana);
  v_hi    := COALESCE(NULLIF(p_payload->>'hora_inicio','')::time, v_serie.hora_inicio);
  v_hf    := COALESCE(NULLIF(p_payload->>'hora_fin','')::time, v_serie.hora_fin);
  v_grupo := COALESCE(NULLIF(p_payload->>'grupo',''), v_serie.grupo);
  v_hon   := NULLIF(p_payload->>'honorario_id','')::uuid;
  v_notas := NULLIF(p_payload->>'notas','');

  IF v_hf <= v_hi THEN RAISE EXCEPTION 'La hora de fin debe ser posterior al inicio.'; END IF;

  IF p_alcance = 'solo_fecha' THEN
    IF p_fecha_efectiva IS NULL THEN RAISE EXCEPTION 'Falta la fecha de la clase a modificar.'; END IF;
    UPDATE public.agenda_grupal
       SET fechas_excluidas = (SELECT ARRAY(SELECT DISTINCT unnest(fechas_excluidas || p_fecha_efectiva))),
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
      activo, tipo_clase, vigente_desde, vigente_hasta, serie_origen_id
    ) VALUES (
      v_coach, v_sede, v_dia, v_hi, v_hf, v_grupo, v_hon, v_notas,
      true, 'recurrente', p_fecha_efectiva, v_serie.vigente_hasta, p_serie_id
    ) RETURNING id INTO v_new_id;
    RETURN v_new_id;

  ELSIF p_alcance = 'toda_serie' THEN
    UPDATE public.agenda_grupal
       SET coach_id = v_coach, sede_id = v_sede, dia_semana = v_dia,
           hora_inicio = v_hi, hora_fin = v_hf, grupo = v_grupo,
           honorario_id = v_hon, notas = v_notas,
           vigente_desde = NULLIF(p_payload->>'vigente_desde','')::date,
           vigente_hasta = NULLIF(p_payload->>'vigente_hasta','')::date,
           updated_at = now()
     WHERE id = p_serie_id;
    RETURN p_serie_id;
  END IF;

  RAISE EXCEPTION 'Alcance inválido: %', p_alcance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_cambio_serie_grupal(uuid, text, date, jsonb) TO authenticated;

-- =========================================================
-- 4) Solicitudes de agenda (profesores → administración)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.agenda_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  solicitado_por uuid,
  tipo text NOT NULL,               -- grupal_crear | grupal_editar | grupal_finalizar | grupal_eliminar | disp_crear | disp_editar | disp_eliminar
  alcance text,                     -- solo_fecha | desde_fecha | toda_serie
  entidad_tipo text,                -- agenda_grupal | disponibilidad
  entidad_id uuid,
  valores_anteriores jsonb NOT NULL DEFAULT '{}'::jsonb,
  valores_nuevos jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha_efectiva date,
  motivo text,
  estado text NOT NULL DEFAULT 'pendiente',   -- pendiente | aprobada | rechazada
  respuesta_admin text,
  resuelto_por uuid,
  resuelto_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_solicitudes_estado_chk CHECK (estado IN ('pendiente','aprobada','rechazada'))
);

GRANT SELECT, INSERT, UPDATE ON public.agenda_solicitudes TO authenticated;
GRANT ALL ON public.agenda_solicitudes TO service_role;

ALTER TABLE public.agenda_solicitudes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches ven sus solicitudes de agenda" ON public.agenda_solicitudes;
CREATE POLICY "Coaches ven sus solicitudes de agenda"
  ON public.agenda_solicitudes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = agenda_solicitudes.coach_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins gestionan solicitudes de agenda" ON public.agenda_solicitudes;
CREATE POLICY "Admins gestionan solicitudes de agenda"
  ON public.agenda_solicitudes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_agenda_solicitudes_estado ON public.agenda_solicitudes (estado, created_at DESC);

CREATE TRIGGER trg_agenda_solicitudes_updated_at
  BEFORE UPDATE ON public.agenda_solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- El profesor propone (crea solicitud + tarea admin)
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

  IF p_entidad_tipo = 'agenda_grupal' AND p_entidad_id IS NOT NULL THEN
    SELECT to_jsonb(g) INTO v_prev FROM public.agenda_grupal g WHERE g.id = p_entidad_id;
    IF v_prev IS NULL OR (v_prev->>'coach_id')::uuid <> v_coach.id THEN
      RAISE EXCEPTION 'Esa clase no te pertenece.';
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
    COALESCE(v_prev, '{}'::jsonb), COALESCE(p_valores_nuevos, '{}'::jsonb), p_fecha_efectiva, NULLIF(btrim(COALESCE(p_motivo,'')), '')
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

-- Admin aprueba o rechaza
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
-- 5) Los profesores dejan de editar la agenda oficial
-- =========================================================
DROP POLICY IF EXISTS "Coaches can manage own disponibilidad" ON public.disponibilidad_coaches;
CREATE POLICY "Coaches ven su disponibilidad"
  ON public.disponibilidad_coaches FOR SELECT TO authenticated
  USING (coach_id IN (SELECT c.id FROM public.coaches c WHERE c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Coaches can manage own disp ajustada" ON public.disponibilidad_ajustada;