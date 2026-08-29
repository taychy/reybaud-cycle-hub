-- Ranking de progresión de grupos
CREATE OR REPLACE FUNCTION public.grupo_rank(p_grupo text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(trim(coalesce(p_grupo, '')))
    WHEN 'aspirantes' THEN 1
    WHEN 'principiante' THEN 2
    WHEN 'g4' THEN 3
    WHEN 'g3' THEN 4
    WHEN 'g2' THEN 5
    WHEN 'g1' THEN 6
    ELSE NULL
  END
$$;

-- Helper: registra hito + tarea de felicitación (o reversión)
CREATE OR REPLACE FUNCTION public.procesar_graduacion_alumno(
  p_alumno_id uuid,
  p_grupo_previo text,
  p_nuevo_grupo text,
  p_actor_uid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_actor_uid, auth.uid());
  v_prev_rank int := public.grupo_rank(p_grupo_previo);
  v_new_rank int := public.grupo_rank(p_nuevo_grupo);
  v_alumno record;
  v_nombre text;
  v_primer_nombre text;
  v_coach text;
  v_email text;
  v_dedupe text;
  v_tarea_id uuid;
  v_mensaje text;
  v_cancel record;
  v_revertidas int := 0;
BEGIN
  SELECT * INTO v_alumno FROM public.alumnos WHERE id = p_alumno_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('graduacion', false);
  END IF;

  v_nombre := trim(COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, ''));
  v_primer_nombre := COALESCE(NULLIF(split_part(trim(COALESCE(v_alumno.nombre, '')), ' ', 1), ''), v_nombre);

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

  -- Reversión: baja de nivel -> cancelar tareas de felicitación abiertas de destinos superiores
  IF v_new_rank IS NOT NULL AND v_prev_rank IS NOT NULL AND v_new_rank < v_prev_rank THEN
    FOR v_cancel IN
      SELECT * FROM public.tareas
      WHERE origen = 'graduacion_alumno'
        AND entidad_tipo = 'alumno' AND entidad_id = p_alumno_id::text
        AND estado <> 'hecha'
        AND public.grupo_rank(metadata->>'grupo_destino') > v_new_rank
    LOOP
      UPDATE public.tareas
      SET estado = 'hecha',
          nota_cierre = 'Cancelada automáticamente: la graduación fue revertida a ' || COALESCE(p_nuevo_grupo, 'sin grupo'),
          cerrada_por = v_uid,
          cerrada_at = now(),
          metadata = v_cancel.metadata || jsonb_build_object('auto_cancelada', true, 'revertida_a', p_nuevo_grupo),
          updated_at = now()
      WHERE id = v_cancel.id;
      INSERT INTO public.tareas_historial (tarea_id, accion, estado_anterior, estado_nuevo, nota, changed_by)
      VALUES (v_cancel.id, 'auto_cancelada', v_cancel.estado, 'hecha', 'Graduación revertida', v_uid);
      v_revertidas := v_revertidas + 1;
    END LOOP;

    IF v_revertidas > 0 THEN
      INSERT INTO public.student_activity_log (alumno_id, event_type, title, description, actor_id, actor_email, actor_role)
      VALUES (
        p_alumno_id, 'graduacion_revertida',
        'Graduación revertida a ' || COALESCE(p_nuevo_grupo, 'sin grupo'),
        'La graduación a ' || COALESCE(p_grupo_previo, 'sin grupo') || ' fue revertida: el alumno vuelve a '
          || COALESCE(p_nuevo_grupo, 'sin grupo') || '. Decisión de ' || v_coach || '.',
        v_uid, v_email, 'coach'
      );
    END IF;

    RETURN jsonb_build_object('graduacion', false, 'revertida', v_revertidas > 0, 'tareas_canceladas', v_revertidas);
  END IF;

  -- No es avance reconocido
  IF v_new_rank IS NULL OR v_prev_rank IS NULL OR v_new_rank <= v_prev_rank THEN
    RETURN jsonb_build_object('graduacion', false);
  END IF;

  -- Hito
  INSERT INTO public.student_activity_log (alumno_id, event_type, title, description, actor_id, actor_email, actor_role)
  VALUES (
    p_alumno_id, 'graduacion_grupo',
    'Graduación a ' || p_nuevo_grupo,
    'Pasó de ' || COALESCE(p_grupo_previo, 'sin grupo') || ' a ' || p_nuevo_grupo
      || '. Decisión tomada por ' || v_coach || ' en el Chequeo de Alumnos el '
      || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
    v_uid, v_email, 'coach'
  );

  -- Tarea de felicitación (una abierta por alumno + destino)
  v_dedupe := 'grad_' || p_alumno_id::text || '_' || lower(p_nuevo_grupo);
  v_mensaje := v_primer_nombre || ', quería felicitarte personalmente. Hoy decidimos que es momento de que pases a '
    || p_nuevo_grupo || '. No es solamente un cambio de grupo: refleja todo lo que fuiste aprendiendo, la constancia '
    || 'y la seguridad que fuiste construyendo arriba de la bici. Nos pone muy contentos acompañar tu evolución. '
    || 'Ahora empieza una nueva etapa, con nuevos desafíos. ¡Felicitaciones, te lo ganaste! 🚴✨';

  IF EXISTS (
    SELECT 1 FROM public.tareas
    WHERE dedupe_key = v_dedupe AND estado <> 'hecha'
  ) THEN
    RETURN jsonb_build_object('graduacion', true, 'tarea_duplicada', true, 'grupo_origen', p_grupo_previo, 'grupo_destino', p_nuevo_grupo);
  END IF;

  INSERT INTO public.tareas (
    tipo, origen, titulo, descripcion, rol_destino, asignado_user_id, prioridad,
    entidad_tipo, entidad_id, dedupe_key, created_by, metadata
  ) VALUES (
    'automatica', 'graduacion_alumno',
    '🎓 Felicitar a ' || v_nombre || ' por su graduación a ' || p_nuevo_grupo,
    'Enviale un mensaje personal por WhatsApp. Podés editar el borrador antes de enviarlo.',
    'coach', v_uid, 'media',
    'alumno', p_alumno_id::text, v_dedupe, v_uid,
    jsonb_build_object(
      'alumno_id', p_alumno_id,
      'alumno_nombre', v_nombre,
      'alumno_telefono', v_alumno.telefono,
      'grupo_origen', p_grupo_previo,
      'grupo_destino', p_nuevo_grupo,
      'coach_nombre', v_coach,
      'mensaje_borrador', v_mensaje,
      'origen_contexto', 'chequeo_alumnos'
    )
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_tarea_id;

  RETURN jsonb_build_object(
    'graduacion', true,
    'tarea_id', v_tarea_id,
    'grupo_origen', p_grupo_previo,
    'grupo_destino', p_nuevo_grupo,
    'mensaje_borrador', v_mensaje
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.procesar_graduacion_alumno(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- RPC de chequeo: valida permisos, actualiza grupo (trigger WhatsApp) y procesa graduación
DROP FUNCTION IF EXISTS public.registrar_cambio_grupo_alumno(uuid, text);

CREATE OR REPLACE FUNCTION public.registrar_cambio_grupo_alumno(
  p_alumno_id uuid,
  p_nuevo_grupo text,
  p_contexto text DEFAULT NULL
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
  v_grad jsonb := jsonb_build_object('graduacion', false);
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
    v_grad := public.procesar_graduacion_alumno(p_alumno_id, v_prev, p_nuevo_grupo, v_uid);
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
    'graduacion', COALESCE(v_grad->'graduacion', 'false'::jsonb),
    'graduacion_detalle', v_grad
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_cambio_grupo_alumno(uuid, text, text) TO authenticated;