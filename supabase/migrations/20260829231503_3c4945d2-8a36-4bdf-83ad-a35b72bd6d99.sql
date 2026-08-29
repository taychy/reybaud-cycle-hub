-- Generalización: comunicación de cambio de grupo al profesor
CREATE OR REPLACE FUNCTION public.procesar_cambio_grupo_alumno(
  p_alumno_id uuid,
  p_grupo_previo text,
  p_nuevo_grupo text,
  p_actor_uid uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_actor_uid, auth.uid());
  v_alumno record;
  v_nombre text;
  v_primer text;
  v_coach text;
  v_email text;
  v_dedupe text := 'gcom_' || p_alumno_id::text;
  v_tarea public.tareas%ROWTYPE;
  v_found boolean := false;
  v_origen text;
  v_prev_rank int;
  v_new_rank int;
  v_tipo text;
  v_titulo text;
  v_mensaje text;
  v_evento text;
  v_evento_titulo text;
  v_tarea_id uuid;
  v_origen_tarea text;
BEGIN
  IF p_nuevo_grupo IS NOT DISTINCT FROM p_grupo_previo THEN
    RETURN jsonb_build_object('tipo_cambio', 'sin_cambio');
  END IF;

  SELECT * INTO v_alumno FROM public.alumnos WHERE id = p_alumno_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tipo_cambio', 'sin_cambio');
  END IF;

  v_nombre := trim(COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, ''));
  v_primer := COALESCE(NULLIF(split_part(trim(COALESCE(v_alumno.nombre, '')), ' ', 1), ''), v_nombre);

  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(NULLIF(ap.nombre_completo, ''), ap.email) INTO v_coach
      FROM public.admin_profiles ap WHERE ap.user_id = v_uid LIMIT 1;
    IF v_coach IS NULL THEN
      SELECT NULLIF(trim(COALESCE(a.nombre, '') || ' ' || COALESCE(a.apellido, '')), '') INTO v_coach
        FROM public.alumnos a WHERE a.user_id = v_uid LIMIT 1;
    END IF;
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;
  END IF;
  v_coach := COALESCE(NULLIF(v_coach, ''), 'Tu profe');

  -- Tarea de comunicación abierta (máx. una por alumno)
  SELECT * INTO v_tarea FROM public.tareas
  WHERE dedupe_key = v_dedupe AND estado <> 'hecha'
  ORDER BY created_at DESC LIMIT 1;
  v_found := FOUND;

  v_origen := CASE WHEN v_found THEN COALESCE(v_tarea.metadata->>'grupo_origen', p_grupo_previo) ELSE p_grupo_previo END;

  -- Corrección: volvió al grupo original antes de comunicar
  IF p_nuevo_grupo IS NOT DISTINCT FROM v_origen THEN
    IF v_found THEN
      UPDATE public.tareas
      SET estado = 'hecha',
          nota_cierre = 'Cancelada automáticamente: el alumno volvió a ' || COALESCE(v_origen, 'sin grupo'),
          cerrada_por = v_uid,
          cerrada_at = now(),
          dedupe_key = v_dedupe || '_cancel_' || v_tarea.id::text,
          metadata = v_tarea.metadata || jsonb_build_object('auto_cancelada', true, 'revertida_a', p_nuevo_grupo),
          updated_at = now()
      WHERE id = v_tarea.id;
      INSERT INTO public.tareas_historial (tarea_id, accion, estado_anterior, estado_nuevo, nota, changed_by)
      VALUES (v_tarea.id, 'auto_cancelada', v_tarea.estado, 'hecha', 'El alumno volvió al grupo original', v_uid);

      INSERT INTO public.student_activity_log (alumno_id, event_type, title, description, actor_id, actor_email, actor_role)
      VALUES (p_alumno_id, 'cambio_grupo_corregido',
        'Cambio de grupo corregido: vuelve a ' || COALESCE(p_nuevo_grupo, 'sin grupo'),
        'El cambio previo fue corregido antes de comunicarlo. Decisión de ' || v_coach || '.',
        v_uid, v_email, 'coach');
    END IF;
    RETURN jsonb_build_object('tipo_cambio', 'corregido', 'tarea_cancelada', v_found,
      'grupo_origen', v_origen, 'grupo_destino', p_nuevo_grupo);
  END IF;

  v_prev_rank := public.grupo_rank(v_origen);
  v_new_rank := public.grupo_rank(p_nuevo_grupo);

  IF v_prev_rank IS NOT NULL AND v_new_rank IS NOT NULL AND v_new_rank > v_prev_rank THEN
    v_tipo := 'graduacion';
  ELSIF v_prev_rank IS NOT NULL AND v_new_rank IS NOT NULL AND v_new_rank < v_prev_rank THEN
    v_tipo := 'descenso';
  ELSE
    v_tipo := 'cambio_grupo';
  END IF;

  IF v_tipo = 'graduacion' THEN
    v_origen_tarea := 'graduacion_alumno';
    v_titulo := '🎓 Felicitar a ' || v_nombre || ' por su graduación a ' || COALESCE(p_nuevo_grupo, 'sin grupo');
    v_mensaje := v_primer || ', quería felicitarte personalmente. Hoy decidimos que es momento de que pases a '
      || COALESCE(p_nuevo_grupo, 'tu nuevo grupo') || '. No es solamente un cambio de grupo: refleja todo lo que fuiste aprendiendo, la constancia '
      || 'y la seguridad que fuiste construyendo arriba de la bici. Nos pone muy contentos acompañar tu evolución. '
      || 'Ahora empieza una nueva etapa, con nuevos desafíos. ¡Felicitaciones, te lo ganaste! 🚴✨';
    v_evento := 'graduacion_grupo';
    v_evento_titulo := 'Graduación a ' || COALESCE(p_nuevo_grupo, 'sin grupo');
  ELSIF v_tipo = 'descenso' THEN
    v_origen_tarea := 'descenso_grupo_alumno';
    v_titulo := '💬 Hablar con ' || v_nombre || ' sobre su cambio a ' || COALESCE(p_nuevo_grupo, 'sin grupo');
    v_mensaje := v_primer || ', quería contarte personalmente que por ahora vamos a pasar a '
      || COALESCE(p_nuevo_grupo, 'otro grupo') || '. La idea es que puedas seguir entrenando en un grupo que acompañe mejor este momento '
      || 'de tu proceso y te permita trabajar con más confianza y seguridad. Esto no borra todo lo que ya avanzaste ni es una sanción; '
      || 'es una decisión para ayudarte a seguir progresando paso a paso. Vamos a acompañarte en esta etapa y revisar juntos cómo vas evolucionando. 💪🚴';
    v_evento := 'descenso_grupo';
    v_evento_titulo := 'Cambio de grupo a ' || COALESCE(p_nuevo_grupo, 'sin grupo');
  ELSE
    v_origen_tarea := 'cambio_grupo_alumno';
    v_titulo := '💬 Avisar a ' || v_nombre || ' su cambio de grupo: ' || COALESCE(v_origen, 'sin grupo') || ' → ' || COALESCE(p_nuevo_grupo, 'sin grupo');
    v_mensaje := v_primer || ', quería avisarte personalmente que a partir de ahora vas a estar en '
      || COALESCE(p_nuevo_grupo, 'otro grupo') || '. Este cambio busca que tu entrenamiento quede mejor alineado con el trabajo que estamos '
      || 'haciendo con vos. Si tenés alguna duda, lo conversamos antes de la próxima clase. 🚴';
    v_evento := 'cambio_grupo';
    v_evento_titulo := 'Cambio de grupo a ' || COALESCE(p_nuevo_grupo, 'sin grupo');
  END IF;

  -- Hito
  INSERT INTO public.student_activity_log (alumno_id, event_type, title, description, actor_id, actor_email, actor_role)
  VALUES (p_alumno_id, v_evento, v_evento_titulo,
    'Pasó de ' || COALESCE(v_origen, 'sin grupo') || ' a ' || COALESCE(p_nuevo_grupo, 'sin grupo')
      || '. Decisión tomada por ' || v_coach || ' en el Chequeo de Alumnos el '
      || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
    v_uid, v_email, 'coach');

  IF v_found THEN
    UPDATE public.tareas
    SET origen = v_origen_tarea,
        titulo = v_titulo,
        asignado_user_id = COALESCE(v_uid, v_tarea.asignado_user_id),
        metadata = v_tarea.metadata || jsonb_build_object(
          'alumno_id', p_alumno_id,
          'alumno_nombre', v_nombre,
          'alumno_telefono', v_alumno.telefono,
          'grupo_origen', v_origen,
          'grupo_destino', p_nuevo_grupo,
          'tipo_cambio', v_tipo,
          'coach_nombre', v_coach,
          'mensaje_borrador', v_mensaje,
          'origen_contexto', 'chequeo_alumnos'
        ),
        estado = CASE WHEN v_tarea.estado = 'pospuesta' THEN 'pendiente'::tarea_estado ELSE v_tarea.estado END,
        updated_at = now()
    WHERE id = v_tarea.id;
    INSERT INTO public.tareas_historial (tarea_id, accion, estado_anterior, estado_nuevo, nota, changed_by)
    VALUES (v_tarea.id, 'actualizada', v_tarea.estado, v_tarea.estado,
      'Nuevo destino: ' || COALESCE(p_nuevo_grupo, 'sin grupo'), v_uid);
    v_tarea_id := v_tarea.id;
  ELSE
    -- liberar dedupe_key de tareas ya cerradas
    UPDATE public.tareas SET dedupe_key = v_dedupe || '_done_' || id::text
    WHERE dedupe_key = v_dedupe AND estado = 'hecha';

    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, asignado_user_id, prioridad,
      entidad_tipo, entidad_id, dedupe_key, created_by, metadata
    ) VALUES (
      'automatica', v_origen_tarea, v_titulo,
      'Comunicáselo por WhatsApp. Podés editar el borrador antes de enviarlo.',
      'coach', v_uid, 'media',
      'alumno', p_alumno_id::text, v_dedupe, v_uid,
      jsonb_build_object(
        'alumno_id', p_alumno_id,
        'alumno_nombre', v_nombre,
        'alumno_telefono', v_alumno.telefono,
        'grupo_origen', v_origen,
        'grupo_destino', p_nuevo_grupo,
        'tipo_cambio', v_tipo,
        'coach_nombre', v_coach,
        'mensaje_borrador', v_mensaje,
        'origen_contexto', 'chequeo_alumnos'
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id INTO v_tarea_id;
  END IF;

  RETURN jsonb_build_object(
    'tipo_cambio', v_tipo,
    'graduacion', v_tipo = 'graduacion',
    'tarea_id', v_tarea_id,
    'grupo_origen', v_origen,
    'grupo_destino', p_nuevo_grupo,
    'mensaje_borrador', v_mensaje
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.procesar_cambio_grupo_alumno(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- Compatibilidad: la función anterior delega en la nueva
CREATE OR REPLACE FUNCTION public.procesar_graduacion_alumno(
  p_alumno_id uuid, p_grupo_previo text, p_nuevo_grupo text, p_actor_uid uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.procesar_cambio_grupo_alumno(p_alumno_id, p_grupo_previo, p_nuevo_grupo, p_actor_uid);
$function$;

REVOKE ALL ON FUNCTION public.procesar_graduacion_alumno(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- RPC de chequeo: usa la nueva función
CREATE OR REPLACE FUNCTION public.registrar_cambio_grupo_alumno(
  p_alumno_id uuid, p_nuevo_grupo text, p_contexto text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev text;
  v_dedupe text := 'wa_grupo_' || p_alumno_id::text;
  v_tarea public.tareas%ROWTYPE;
  v_com jsonb := jsonb_build_object('tipo_cambio', 'sin_cambio', 'graduacion', false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'coach')) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  SELECT grupo INTO v_prev FROM public.alumnos WHERE id = p_alumno_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumno inexistente';
  END IF;

  IF p_nuevo_grupo IS NOT DISTINCT FROM v_prev THEN
    RETURN jsonb_build_object('accion', 'sin_cambio', 'grupo_destino', p_nuevo_grupo, 'graduacion', false);
  END IF;

  UPDATE public.alumnos SET grupo = p_nuevo_grupo WHERE id = p_alumno_id;

  IF p_contexto = 'chequeo_alumnos' THEN
    v_com := public.procesar_cambio_grupo_alumno(p_alumno_id, v_prev, p_nuevo_grupo, v_uid);
  END IF;

  SELECT * INTO v_tarea FROM public.tareas
  WHERE dedupe_key = v_dedupe
  ORDER BY updated_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'accion', CASE
      WHEN v_tarea.id IS NULL THEN 'sin_cambio'
      WHEN v_tarea.estado = 'hecha' THEN 'cancelada'
      ELSE 'creada' END,
    'tarea_id', v_tarea.id,
    'grupo_origen', v_tarea.metadata->>'grupo_origen',
    'grupo_destino', p_nuevo_grupo,
    'graduacion', COALESCE(v_com->'graduacion', 'false'::jsonb),
    'comunicacion', v_com,
    'graduacion_detalle', v_com
  );
END;
$function$;

-- Backfill autorizado: 4 graduaciones G3 -> G2 de hoy (Claudio Reybaud)
DO $backfill$
DECLARE
  v_uid uuid := 'fac4a969-14f8-4c3e-9990-0f2e7ba0193f';
  v_email text;
  v_ids uuid[] := ARRAY[
    '69940c4b-d13b-4bc3-93cb-62d0db85c16f',
    'ce5ff2e6-82db-4c4f-9aab-206828173aa9',
    'be083091-d40e-4ad2-8a17-46641f8216b3',
    '0c10a332-97c6-4e15-8701-d6b0d43bcfc7'
  ]::uuid[];
  v_id uuid;
  v_a record;
  v_nombre text;
  v_primer text;
  v_msg text;
  v_dedupe text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO v_a FROM public.alumnos WHERE id = v_id;
    CONTINUE WHEN NOT FOUND;
    v_nombre := trim(COALESCE(v_a.nombre, '') || ' ' || COALESCE(v_a.apellido, ''));
    v_primer := COALESCE(NULLIF(split_part(trim(COALESCE(v_a.nombre, '')), ' ', 1), ''), v_nombre);
    v_dedupe := 'gcom_' || v_id::text;
    v_msg := v_primer || ', quería felicitarte personalmente. Hoy decidimos que es momento de que pases a G2. '
      || 'No es solamente un cambio de grupo: refleja todo lo que fuiste aprendiendo, la constancia y la seguridad que '
      || 'fuiste construyendo arriba de la bici. Nos pone muy contentos acompañar tu evolución. Ahora empieza una nueva '
      || 'etapa, con nuevos desafíos. ¡Felicitaciones, te lo ganaste! 🚴✨';

    IF NOT EXISTS (
      SELECT 1 FROM public.student_activity_log
      WHERE alumno_id = v_id AND event_type = 'graduacion_grupo'
        AND created_at > now() - interval '2 days'
    ) THEN
      INSERT INTO public.student_activity_log (alumno_id, event_type, title, description, actor_id, actor_email, actor_role)
      VALUES (v_id, 'graduacion_grupo', 'Graduación a G2',
        'Pasó de G3 a G2. Decisión tomada por Claudio Reybaud en el Chequeo de Alumnos.',
        v_uid, v_email, 'coach');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.tareas
      WHERE origen = 'graduacion_alumno' AND entidad_id = v_id::text AND estado <> 'hecha'
    ) THEN
      INSERT INTO public.tareas (
        tipo, origen, titulo, descripcion, rol_destino, asignado_user_id, prioridad,
        entidad_tipo, entidad_id, dedupe_key, created_by, metadata
      ) VALUES (
        'automatica', 'graduacion_alumno',
        '🎓 Felicitar a ' || v_nombre || ' por su graduación a G2',
        'Comunicáselo por WhatsApp. Podés editar el borrador antes de enviarlo.',
        'coach', v_uid, 'media',
        'alumno', v_id::text, v_dedupe, v_uid,
        jsonb_build_object(
          'alumno_id', v_id,
          'alumno_nombre', v_nombre,
          'alumno_telefono', v_a.telefono,
          'grupo_origen', 'G3',
          'grupo_destino', 'G2',
          'tipo_cambio', 'graduacion',
          'coach_nombre', 'Claudio Reybaud',
          'mensaje_borrador', v_msg,
          'origen_contexto', 'chequeo_alumnos',
          'backfill', true
        )
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$backfill$;