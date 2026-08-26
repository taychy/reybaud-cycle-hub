-- 1) Marcas de comunicación
ALTER TABLE public.reservas_turnera
  ADD COLUMN IF NOT EXISTS confirmacion_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS coach_aviso_enviado_at timestamptz;

-- 2) Ocupación con intervalo real (agrega hora_fin)
DROP FUNCTION IF EXISTS public.get_reservas_turnera_ocupadas(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_reservas_turnera_ocupadas(p_servicio_id uuid, p_desde date, p_hasta date)
RETURNS TABLE(fecha date, hora_inicio time without time zone, hora_fin time without time zone, coach_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.fecha, r.hora_inicio, r.hora_fin, r.coach_id
  FROM public.reservas_turnera r
  WHERE r.fecha >= p_desde
    AND r.fecha <= p_hasta
    AND COALESCE(r.estado_operativo, '') NOT LIKE 'cancelada%'
    AND r.coach_id IN (
      SELECT DISTINCT dc.coach_id
      FROM public.disponibilidad_coaches dc
      WHERE dc.servicio_id = p_servicio_id
        AND dc.activo = true
    );
$function$;
GRANT EXECUTE ON FUNCTION public.get_reservas_turnera_ocupadas(uuid, date, date) TO anon, authenticated, service_role;

-- 3) Identificación segura de alumno existente (match exacto y unívoco email + documento)
CREATE OR REPLACE FUNCTION public.find_alumno_for_turnera(p_email text, p_documento text)
RETURNS TABLE(alumno_id uuid, nombre text, apellido_inicial text, email text, celular text, documento text, fecha_nacimiento date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_doc text := NULLIF(regexp_replace(COALESCE(p_documento, ''), '[^0-9]', '', 'g'), '');
  v_ids uuid[];
BEGIN
  IF v_email IS NULL OR v_doc IS NULL OR length(v_doc) < 7 THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT a.id) INTO v_ids
  FROM public.alumnos a
  WHERE NULLIF(regexp_replace(COALESCE(a.documento, ''), '[^0-9]', '', 'g'), '') = v_doc
    AND (
      lower(trim(COALESCE(a.email, ''))) = v_email
      OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.emails_adicionales, ARRAY[]::text[])) ea
        WHERE lower(trim(ea)) = v_email
      )
    );

  IF COALESCE(array_length(v_ids, 1), 0) <> 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id,
         a.nombre,
         NULLIF(left(COALESCE(a.apellido, ''), 1), '') || '.',
         COALESCE(a.email, v_email),
         a.celular,
         a.documento,
         a.fecha_nacimiento
  FROM public.alumnos a
  WHERE a.id = v_ids[1];
END;
$function$;
GRANT EXECUTE ON FUNCTION public.find_alumno_for_turnera(text, text) TO anon, authenticated, service_role;

-- 4) Creación atómica de reserva con revalidación de solapamiento
CREATE OR REPLACE FUNCTION public.create_turnera_reservation(
  p_reservation_id uuid,
  p_servicio_id uuid,
  p_coach_id uuid,
  p_sede_id uuid,
  p_fecha date,
  p_hora_inicio time without time zone,
  p_hora_fin time without time zone,
  p_nombre text,
  p_apellido text,
  p_email text,
  p_celular text,
  p_documento text,
  p_fecha_nacimiento date,
  p_nota text,
  p_acepto_politica boolean,
  p_origen_link text,
  p_form_responses jsonb DEFAULT '{}'::jsonb,
  p_alumno_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_precio numeric;
  v_moneda text;
  v_conflict boolean;
BEGIN
  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'Horario inválido.';
  END IF;

  SELECT precio, moneda INTO v_precio, v_moneda
  FROM public.servicios_turnera WHERE id = p_servicio_id;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || p_fecha::text, 0));

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
GRANT EXECUTE ON FUNCTION public.create_turnera_reservation(uuid, uuid, uuid, uuid, date, time without time zone, time without time zone, text, text, text, text, text, date, text, boolean, text, jsonb, uuid) TO anon, authenticated, service_role;

-- 5) Preguntas de Clase Evaluatoria (sólo si no hay ninguna configurada)
UPDATE public.servicios_turnera
SET form_fields = '[
  {"key":"experiencia_ciclismo","label":"¿Hace cuánto andás en bicicleta y con qué frecuencia entrenás actualmente?","type":"textarea","required":true},
  {"key":"experiencia_peloton","label":"¿Tenés experiencia rodando en pelotón? Contanos brevemente.","type":"textarea","required":true},
  {"key":"objetivo_evaluacion","label":"¿Cuál es tu principal objetivo o qué te gustaría que el profesor observe durante la evaluación?","type":"textarea","required":true}
]'::jsonb,
updated_at = now()
WHERE id = '515fa9bc-d5fd-4a3c-a01f-4191c50ecf20'
  AND (form_fields IS NULL OR jsonb_array_length(COALESCE(form_fields, '[]'::jsonb)) = 0);