
CREATE OR REPLACE FUNCTION public.reconciliar_tarea_whatsapp_grupo(
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
  v_confirmado text;
  v_alumno record;
  v_tarea public.tareas%ROWTYPE;
  v_found boolean := false;
  v_origen text;
  v_actor text;
  v_dedupe text := 'wa_grupo_' || p_alumno_id::text;
  v_accion text := 'sin_cambio';
  v_tarea_id uuid;
  v_nombre text;
BEGIN
  IF p_nuevo_grupo IS NOT DISTINCT FROM p_grupo_previo THEN
    RETURN jsonb_build_object('accion', 'sin_cambio');
  END IF;

  SELECT * INTO v_alumno FROM public.alumnos WHERE id = p_alumno_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('accion', 'sin_cambio');
  END IF;

  v_nombre := trim(COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, ''));
  v_confirmado := COALESCE(v_alumno.whatsapp_grupo_confirmado, p_grupo_previo);

  IF v_uid IS NOT NULL THEN
    SELECT NULLIF(trim(COALESCE(a.nombre, '') || ' ' || COALESCE(a.apellido, '')), '')
      INTO v_actor FROM public.alumnos a WHERE a.user_id = v_uid LIMIT 1;
    IF v_actor IS NULL THEN
      SELECT COALESCE(NULLIF(trim(COALESCE(ap.first_name, '') || ' ' || COALESCE(ap.last_name, '')), ''), ap.email)
        INTO v_actor FROM public.admin_profiles ap WHERE ap.user_id = v_uid LIMIT 1;
    END IF;
  END IF;
  v_actor := COALESCE(NULLIF(v_actor, ''), 'Sistema');

  SELECT * INTO v_tarea FROM public.tareas
  WHERE dedupe_key = v_dedupe AND estado <> 'hecha'
  ORDER BY created_at DESC LIMIT 1;
  v_found := FOUND;

  IF v_found THEN
    v_origen := COALESCE(v_tarea.metadata->>'grupo_origen', v_confirmado);
  ELSE
    v_origen := v_confirmado;
  END IF;

  IF p_nuevo_grupo IS NOT DISTINCT FROM v_origen THEN
    IF v_found THEN
      UPDATE public.tareas
      SET estado = 'hecha',
          nota_cierre = 'Cancelada automáticamente: el alumno volvió al grupo ' || COALESCE(v_origen, 'sin grupo'),
          cerrada_por = v_uid,
          cerrada_at = now(),
          metadata = v_tarea.metadata || jsonb_build_object('grupo_destino', p_nuevo_grupo, 'auto_cancelada', true),
          updated_at = now()
      WHERE id = v_tarea.id;
      INSERT INTO public.tareas_historial (tarea_id, accion, estado_anterior, estado_nuevo, nota, changed_by)
      VALUES (v_tarea.id, 'auto_cancelada', v_tarea.estado, 'hecha', 'El alumno volvió al grupo original', v_uid);
      v_accion := 'cancelada';
      v_tarea_id := v_tarea.id;
    END IF;
    RETURN jsonb_build_object('accion', v_accion, 'tarea_id', v_tarea_id, 'grupo_origen', v_origen, 'grupo_destino', p_nuevo_grupo);
  END IF;

  IF v_found THEN
    UPDATE public.tareas
    SET titulo = 'WhatsApp · cambio de grupo: ' || v_nombre,
        descripcion = 'Quitar a ' || v_nombre
          || ' del grupo de WhatsApp ' || COALESCE(v_origen, 'sin grupo')
          || ' y agregarlo al grupo ' || COALESCE(p_nuevo_grupo, 'sin grupo')
          || '. Cambio hecho por ' || v_actor || ' el ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
        metadata = v_tarea.metadata || jsonb_build_object(
          'alumno_id', p_alumno_id,
          'alumno_nombre', v_nombre,
          'grupo_origen', v_origen,
          'grupo_destino', p_nuevo_grupo,
          'cambiado_por', v_uid,
          'cambiado_por_nombre', v_actor,
          'cambiado_at', now(),
          'auto_cancelada', false
        ),
        estado = CASE WHEN v_tarea.estado = 'pospuesta' THEN 'pendiente'::tarea_estado ELSE v_tarea.estado END,
        updated_at = now()
    WHERE id = v_tarea.id;
    INSERT INTO public.tareas_historial (tarea_id, accion, estado_anterior, estado_nuevo, nota, changed_by)
    VALUES (v_tarea.id, 'actualizada', v_tarea.estado, v_tarea.estado,
            'Nuevo destino: ' || COALESCE(p_nuevo_grupo, 'sin grupo') || ' (antes ' || COALESCE(p_grupo_previo, 'sin grupo') || ')', v_uid);
    v_accion := 'actualizada';
    v_tarea_id := v_tarea.id;
  ELSE
    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, prioridad,
      entidad_tipo, entidad_id, dedupe_key, created_by, metadata
    ) VALUES (
      'automatica', 'whatsapp_grupo',
      'WhatsApp · cambio de grupo: ' || v_nombre,
      'Quitar a ' || v_nombre
        || ' del grupo de WhatsApp ' || COALESCE(v_origen, 'sin grupo')
        || ' y agregarlo al grupo ' || COALESCE(p_nuevo_grupo, 'sin grupo')
        || '. Cambio hecho por ' || v_actor || ' el ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
      'admin', 'media',
      'alumno', p_alumno_id, v_dedupe, v_uid,
      jsonb_build_object(
        'alumno_id', p_alumno_id,
        'alumno_nombre', v_nombre,
        'grupo_origen', v_origen,
        'grupo_destino', p_nuevo_grupo,
        'cambiado_por', v_uid,
        'cambiado_por_nombre', v_actor,
        'cambiado_at', now(),
        'auto_cancelada', false
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id INTO v_tarea_id;
    v_accion := CASE WHEN v_tarea_id IS NULL THEN 'sin_cambio' ELSE 'creada' END;
  END IF;

  RETURN jsonb_build_object('accion', v_accion, 'tarea_id', v_tarea_id, 'grupo_origen', v_origen, 'grupo_destino', p_nuevo_grupo);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconciliar_tarea_whatsapp_grupo(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
