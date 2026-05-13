CREATE OR REPLACE FUNCTION public.generate_tareas_automaticas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_today date := CURRENT_DATE;
  v_day integer := EXTRACT(DAY FROM CURRENT_DATE)::integer;
  v_month text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_bucket15 integer := (v_today - DATE '2024-01-01') / 15;
  v_grupo text;
  r record;
BEGIN
  -- 1. WhatsApp check (días 5-7 y 15-17)
  IF v_day BETWEEN 5 AND 7 OR v_day BETWEEN 15 AND 17 THEN
    FOR v_grupo IN
      SELECT DISTINCT grupo::text FROM public.alumnos WHERE estado = 'activo'
    LOOP
      INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, dedupe_key, metadata)
      VALUES (
        'automatica', 'whatsapp_check',
        'Chequear WhatsApp del grupo ' || v_grupo,
        'Validar que todos los alumnos activos del grupo ' || v_grupo || ' estén en el grupo de WhatsApp correspondiente.',
        'admin', 'alta',
        CASE WHEN v_day <= 7 THEN make_date(EXTRACT(YEAR FROM v_today)::int, EXTRACT(MONTH FROM v_today)::int, 7)
             ELSE make_date(EXTRACT(YEAR FROM v_today)::int, EXTRACT(MONTH FROM v_today)::int, 17) END,
        'whatsapp_check:' || v_grupo || ':' || v_month || ':' || (CASE WHEN v_day <= 7 THEN 'q1' ELSE 'q2' END),
        jsonb_build_object('grupo', v_grupo, 'mes', v_month)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
  END IF;

  -- 2. Alumnos activos +30d sin actualización
  FOR r IN
    SELECT a.id, a.nombre, a.apellido FROM public.alumnos a
    WHERE a.estado = 'activo'
      AND a.updated_at < (now() - interval '30 days')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'alumno_inactivo_30d',
      'Contactar a ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      'Alumno activo sin actividad ni actualizaciones hace más de 30 días. Riesgo de abandono.',
      'admin', 'alta', 'alumno', r.id::text,
      'alumno_inactivo_30d:' || r.id::text || ':' || v_month,
      jsonb_build_object('alumno_id', r.id)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 3. Coaches sin feedback +14d
  FOR r IN
    SELECT c.id, c.user_id, c.nombre,
      (SELECT MAX(fecha) FROM public.feedback_coach WHERE coach_id = c.id) AS last_fb
    FROM public.coaches c
    WHERE c.estado = 'activo'
  LOOP
    IF r.last_fb IS NULL OR r.last_fb < (v_today - interval '14 days') THEN
      INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, asignado_user_id, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
      VALUES (
        'automatica', 'coach_sin_feedback_14d',
        'Cargar feedback de alumnos',
        'Hace más de 14 días que no registrás feedback de tus alumnos. Cargá observaciones para mantener el seguimiento.',
        'coach', r.user_id, 'media', 'coach', r.id::text,
        'coach_sin_feedback_14d:' || r.id::text || ':' || to_char(v_today, 'IYYY-IW'),
        jsonb_build_object('coach_id', r.id, 'last_feedback', r.last_fb)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;

  -- 4a. Certificados médicos NO CARGADOS (alumnos activos)
  FOR r IN
    SELECT id, nombre, apellido
    FROM public.alumnos
    WHERE estado = 'activo'
      AND COALESCE(medical_certificate_status, 'no_cargado') = 'no_cargado'
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'certificado_no_cargado',
      'Solicitar certificado médico a ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      'Alumno activo sin certificado médico cargado. Solicitar el apto y subirlo. Reaparece cada 15 días hasta cargarlo.',
      'admin', 'alta', 'alumno', r.id::text,
      'certificado_no_cargado:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('alumno_id', r.id, 'bucket', v_bucket15)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 4b. Certificados médicos por vencer (próximos 30 días) o vencidos
  FOR r IN
    SELECT id, nombre, apellido, medical_certificate_expiration_date
    FROM public.alumnos
    WHERE estado = 'activo'
      AND medical_certificate_expiration_date IS NOT NULL
      AND medical_certificate_expiration_date <= (v_today + interval '30 days')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'certificado_por_vencer',
      'Certificado médico de ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      CASE WHEN r.medical_certificate_expiration_date < v_today
           THEN 'Certificado VENCIDO el ' || r.medical_certificate_expiration_date || '. Solicitar renovación urgente.'
           ELSE 'Certificado vence el ' || r.medical_certificate_expiration_date || '. Recordar al alumno renovarlo.' END,
      'admin',
      CASE WHEN r.medical_certificate_expiration_date < v_today THEN 'critica'::tarea_prioridad ELSE 'media'::tarea_prioridad END,
      r.medical_certificate_expiration_date, 'alumno', r.id::text,
      'certificado_por_vencer:' || r.id::text || ':' || r.medical_certificate_expiration_date,
      jsonb_build_object('alumno_id', r.id, 'vence', r.medical_certificate_expiration_date)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 5. Pagos pendientes de verificación +48h (reciclado cada 15 días)
  FOR r IN
    SELECT s.id, s.alumno_id, a.nombre, a.apellido, s.updated_at
    FROM public.suscripciones s
    JOIN public.alumnos a ON a.id = s.alumno_id
    WHERE s.estado = 'pendiente_verificacion'
      AND s.updated_at < (now() - interval '48 hours')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'pago_pendiente_validar',
      'Validar pago de ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      'Hay un pago informado hace más de 48 horas que sigue pendiente de verificación. Revisar y validar.',
      'admin', 'alta', 'suscripcion', r.id::text,
      'pago_pendiente_validar:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('suscripcion_id', r.id, 'alumno_id', r.alumno_id, 'bucket', v_bucket15)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 6. Suscripciones pendientes / pausadas — revisar cada 15 días
  FOR r IN
    SELECT s.id, s.alumno_id, a.nombre, a.apellido, s.estado, s.created_at
    FROM public.suscripciones s
    JOIN public.alumnos a ON a.id = s.alumno_id
    WHERE s.estado IN ('pendiente','pago_pendiente','pausa','acceso_pausado')
      AND s.cancelada_at IS NULL
      AND s.created_at < (now() - interval '24 hours')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'suscripcion_pendiente_15d',
      'Revisar suscripción de ' || r.nombre || ' ' || COALESCE(r.apellido, '') || ' (' || r.estado || ')',
      'Suscripción en estado "' || r.estado || '" sin resolverse. Contactar al alumno para destrabar y dejar comentario. Reaparece en 15 días si no se resuelve.',
      'admin', 'alta', 'suscripcion', r.id::text,
      'suscripcion_pendiente_15d:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('suscripcion_id', r.id, 'alumno_id', r.alumno_id, 'estado_sub', r.estado, 'bucket', v_bucket15)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 7. Alumnos NO dados de baja sin suscripción vigente (incluye 'activa' con fecha_fin pasada)
  FOR r IN
    SELECT a.id AS alumno_id, a.nombre, a.apellido,
      (SELECT MAX(s2.fecha_fin) FROM public.suscripciones s2
        WHERE s2.alumno_id = a.id AND s2.cancelada_at IS NULL) AS ultima_fin
    FROM public.alumnos a
    WHERE a.estado NOT IN ('inactivo','bloqueado')
      AND NOT EXISTS (
        SELECT 1 FROM public.suscripciones s
        WHERE s.alumno_id = a.id
          AND s.cancelada_at IS NULL
          AND (
            (s.estado = 'activa' AND (s.fecha_fin IS NULL OR s.fecha_fin >= v_today))
            OR s.estado IN ('pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa')
          )
      )
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'suscripcion_vencida_sin_renovar',
      'Renovar plan de ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      'Alumno sin suscripción vigente' ||
        CASE WHEN r.ultima_fin IS NOT NULL THEN ' (última venció el ' || r.ultima_fin || ')' ELSE '' END ||
        '. Confirmar si renueva o pasa a baja. Reaparece cada 15 días hasta resolver.',
      'admin', 'alta', 'alumno', r.alumno_id::text,
      'suscripcion_vencida_sin_renovar:' || r.alumno_id::text || ':b' || v_bucket15,
      jsonb_build_object('alumno_id', r.alumno_id, 'ultima_fin', r.ultima_fin, 'bucket', v_bucket15)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 8. Alumnos en estados intermedios — revisión cada 15 días
  FOR r IN
    SELECT id, nombre, apellido, estado, pause_motivo, pause_fecha_estimada_retorno
    FROM public.alumnos
    WHERE estado NOT IN ('activo','inactivo','bloqueado')
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'alumno_estado_intermedio_15d',
      'Revisar caso de ' || r.nombre || ' ' || COALESCE(r.apellido, '') || ' (' || r.estado || ')',
      'Alumno en estado "' || r.estado || '"' ||
        CASE WHEN r.pause_motivo IS NOT NULL THEN '. Motivo: ' || r.pause_motivo ELSE '' END ||
        CASE WHEN r.pause_fecha_estimada_retorno IS NOT NULL THEN '. Retorno estimado: ' || r.pause_fecha_estimada_retorno ELSE '' END ||
        '. Definir si vuelve a activo o pasa a baja. Reaparece cada 15 días hasta resolver.',
      'admin', 'media', 'alumno', r.id::text,
      'alumno_estado_intermedio_15d:' || r.id::text || ':b' || v_bucket15,
      jsonb_build_object('alumno_id', r.id, 'estado', r.estado, 'bucket', v_bucket15)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- 9. Renovación próxima: suscripciones activas que vencen en los próximos 7 días
  FOR r IN
    SELECT s.id, s.alumno_id, a.nombre, a.apellido, s.fecha_fin
    FROM public.suscripciones s
    JOIN public.alumnos a ON a.id = s.alumno_id
    WHERE s.estado = 'activa'
      AND s.cancelada_at IS NULL
      AND s.fecha_fin BETWEEN v_today AND v_today + 7
  LOOP
    INSERT INTO public.tareas (tipo, origen, titulo, descripcion, rol_destino, prioridad, fecha_vencimiento, entidad_tipo, entidad_id, dedupe_key, metadata)
    VALUES (
      'automatica', 'renovacion_proxima_7d',
      'Renovación próxima de ' || r.nombre || ' ' || COALESCE(r.apellido, ''),
      'Suscripción vence el ' || r.fecha_fin || '. Coordinar renovación o confirmar continuidad.',
      'admin', 'media', r.fecha_fin, 'suscripcion', r.id::text,
      'renovacion_proxima_7d:' || r.id::text || ':' || r.fecha_fin,
      jsonb_build_object('suscripcion_id', r.id, 'alumno_id', r.alumno_id, 'fecha_fin', r.fecha_fin)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;