-- Bloques puntuales de Turnera. Las filas existentes quedan semanales y sin exención.
ALTER TABLE public.disponibilidad_coaches
  ADD COLUMN IF NOT EXISTS fecha_excepcional date,
  ADD COLUMN IF NOT EXISTS omitir_anticipacion_minima boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.disponibilidad_coaches.fecha_excepcional IS
  'Fecha puntual del bloque; NULL conserva el comportamiento semanal.';
COMMENT ON COLUMN public.disponibilidad_coaches.omitir_anticipacion_minima IS
  'Sólo omite la anticipación mínima para este bloque excepcional/fecha/servicio.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'disponibilidad_coaches_excepcional_dow_chk'
  ) THEN
    ALTER TABLE public.disponibilidad_coaches
      ADD CONSTRAINT disponibilidad_coaches_excepcional_dow_chk
      CHECK (
        fecha_excepcional IS NULL
        OR dia_semana = EXTRACT(DOW FROM fecha_excepcional)::integer
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'disponibilidad_coaches_anticipacion_excepcional_chk'
  ) THEN
    ALTER TABLE public.disponibilidad_coaches
      ADD CONSTRAINT disponibilidad_coaches_anticipacion_excepcional_chk
      CHECK (NOT omitir_anticipacion_minima OR fecha_excepcional IS NOT NULL);
  END IF;
END $$;

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
  v_excepcion_sin_anticipacion boolean;
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

  -- La exención nunca habilita una fecha/hora ya pasada.
  IF (p_fecha + p_hora_inicio) < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires') THEN
    RAISE EXCEPTION 'Ese turno ya pasó. Elegí otro turno.';
  END IF;

  -- La exención nace únicamente de un bloque activo que contiene el turno y
  -- coincide con esta fecha, servicio, profesor y sede. No es un parámetro del cliente.
  SELECT EXISTS (
    SELECT 1 FROM public.disponibilidad_coaches d
    WHERE d.coach_id = p_coach_id AND d.servicio_id = p_servicio_id
      AND d.fecha_excepcional = p_fecha
      AND COALESCE(d.omitir_anticipacion_minima, false)
      AND COALESCE(d.activo, false)
      AND p_hora_inicio >= d.hora_inicio AND p_hora_fin <= d.hora_fin
      AND (p_sede_id IS NULL OR d.sede_id IS NULL OR d.sede_id = p_sede_id)
  ) INTO v_excepcion_sin_anticipacion;

  IF NOT v_excepcion_sin_anticipacion
     AND (p_fecha + p_hora_inicio) < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + make_interval(hours => v_antic)) THEN
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
        AND (
          d.fecha_excepcional = p_fecha
          OR (d.fecha_excepcional IS NULL AND d.dia_semana = v_dow)
        )
        AND COALESCE(d.activo, false)
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
