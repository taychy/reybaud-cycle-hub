-- 1) Reconciliar coach_sedes con las sedes realmente usadas (idempotente, sin borrar)
INSERT INTO public.coach_sedes (coach_id, sede_id)
SELECT DISTINCT src.coach_id, src.sede_id
FROM (
  SELECT ag.coach_id, ag.sede_id FROM public.agenda_grupal ag WHERE ag.sede_id IS NOT NULL AND ag.coach_id IS NOT NULL
  UNION
  SELECT dc.coach_id, dc.sede_id FROM public.disponibilidad_coaches dc WHERE dc.sede_id IS NOT NULL AND dc.coach_id IS NOT NULL
) src
JOIN public.coaches c ON c.id = src.coach_id
JOIN public.sedes s ON s.id = src.sede_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.coach_sedes cs WHERE cs.coach_id = src.coach_id AND cs.sede_id = src.sede_id
);

-- 2) create_turnera_reservation: rechazar si se solapa con una clase grupal activa del coach
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
  v_grupal boolean;
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

  -- Clases grupales del coach (misma convención DOW que Postgres/JS)
  SELECT EXISTS (
    SELECT 1 FROM public.agenda_grupal g
    WHERE g.coach_id = p_coach_id
      AND COALESCE(g.activo, true)
      AND g.dia_semana = v_dow
      AND p_hora_inicio < g.hora_fin
      AND p_hora_fin > g.hora_inicio
  ) INTO v_grupal;

  IF v_grupal THEN
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

-- 3) Reserva manual segura para admin
CREATE OR REPLACE FUNCTION public.admin_create_turnera_reservation(
  p_servicio_id uuid,
  p_coach_id uuid,
  p_sede_id uuid,
  p_fecha date,
  p_hora_inicio time without time zone,
  p_hora_fin time without time zone,
  p_nombre text,
  p_apellido text,
  p_email text,
  p_celular text DEFAULT NULL,
  p_documento text DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_alumno_id uuid DEFAULT NULL,
  p_precio numeric DEFAULT NULL,
  p_estado_economico text DEFAULT 'pendiente'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := gen_random_uuid();
  v_dow int;
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

  v_dow := EXTRACT(DOW FROM p_fecha)::int;

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

  SELECT g.hora_inicio, g.hora_fin, g.grupo INTO v_grupal
  FROM public.agenda_grupal g
  WHERE g.coach_id = p_coach_id
    AND COALESCE(g.activo, true)
    AND g.dia_semana = v_dow
    AND p_hora_inicio < g.hora_fin
    AND p_hora_fin > g.hora_inicio
  ORDER BY g.hora_inicio LIMIT 1;

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

REVOKE ALL ON FUNCTION public.admin_create_turnera_reservation(uuid,uuid,uuid,date,time,time,text,text,text,text,text,text,uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_turnera_reservation(uuid,uuid,uuid,date,time,time,text,text,text,text,text,text,uuid,numeric,text) TO authenticated;