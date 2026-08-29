ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS whatsapp_grupo_confirmado text,
  ADD COLUMN IF NOT EXISTS whatsapp_grupo_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_grupo_sync_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS tareas_dedupe_key_uidx ON public.tareas (dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_cambio_grupo_alumno(
  p_alumno_id uuid,
  p_nuevo_grupo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev text;
  v_confirmado text;
  v_alumno record;
  v_tarea public.tareas%ROWTYPE;
  v_origen text;
  v_actor text;
  v_dedupe text;
  v_accion text := 'sin_cambio';
  v_tarea_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'coach')) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  SELECT * INTO v_alumno FROM public.alumnos WHERE id = p_alumno_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumno inexistente';
  END IF;

  v_prev := v_alumno.grupo;
  v_confirmado := COALESCE(v_alumno.whatsapp_grupo_confirmado, v_prev);
  v_dedupe := 'wa_grupo_' || p_alumno_id::text;

  UPDATE public.alumnos SET grupo = p_nuevo_grupo WHERE id = p_alumno_id;

  SELECT COALESCE(nombre, '') INTO v_actor
  FROM public.alumnos WHERE user_id = v_uid LIMIT 1;
  IF v_actor IS NULL OR v_actor = '' THEN
    SELECT COALESCE(nombre_completo, email, 'Staff') INTO v_actor
    FROM public.admin_profiles WHERE user_id = v_uid LIMIT 1;
  END IF;
  v_actor := COALESCE(NULLIF(v_actor, ''), 'Staff');

  SELECT * INTO v_tarea FROM public.tareas
  WHERE dedupe_key = v_dedupe AND estado <> 'hecha'
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    v_origen := COALESCE(v_tarea.metadata->>'grupo_origen', v_confirmado);
  ELSE
    v_origen := v_confirmado;
  END IF;

  -- Volvió al grupo ya sincronizado: no hay nada que hacer
  IF p_nuevo_grupo IS NOT DISTINCT FROM v_origen THEN
    IF v_tarea.id IS NOT NULL THEN
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

  IF v_tarea.id IS NOT NULL THEN
    UPDATE public.tareas
    SET titulo = 'WhatsApp · cambio de grupo: ' || COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, ''),
        descripcion = 'Quitar a ' || COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, '')
          || ' del grupo de WhatsApp ' || COALESCE(v_origen, 'sin grupo')
          || ' y agregarlo al grupo ' || COALESCE(p_nuevo_grupo, 'sin grupo')
          || '. Cambio hecho por ' || v_actor || ' el ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
        metadata = v_tarea.metadata || jsonb_build_object(
          'alumno_id', p_alumno_id,
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
            'Nuevo destino: ' || COALESCE(p_nuevo_grupo, 'sin grupo') || ' (antes ' || COALESCE(v_prev, 'sin grupo') || ')', v_uid);
    v_accion := 'actualizada';
    v_tarea_id := v_tarea.id;
  ELSE
    INSERT INTO public.tareas (
      tipo, origen, titulo, descripcion, rol_destino, prioridad,
      entidad_tipo, entidad_id, dedupe_key, created_by, metadata
    ) VALUES (
      'automatica', 'whatsapp_grupo',
      'WhatsApp · cambio de grupo: ' || COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, ''),
      'Quitar a ' || COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, '')
        || ' del grupo de WhatsApp ' || COALESCE(v_origen, 'sin grupo')
        || ' y agregarlo al grupo ' || COALESCE(p_nuevo_grupo, 'sin grupo')
        || '. Cambio hecho por ' || v_actor || ' el ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '.',
      'admin', 'media',
      'alumno', p_alumno_id, v_dedupe, v_uid,
      jsonb_build_object(
        'alumno_id', p_alumno_id,
        'alumno_nombre', trim(COALESCE(v_alumno.nombre, '') || ' ' || COALESCE(v_alumno.apellido, '')),
        'grupo_origen', v_origen,
        'grupo_destino', p_nuevo_grupo,
        'cambiado_por', v_uid,
        'cambiado_por_nombre', v_actor,
        'cambiado_at', now(),
        'auto_cancelada', false
      )
    )
    RETURNING id INTO v_tarea_id;
    v_accion := 'creada';
  END IF;

  RETURN jsonb_build_object('accion', v_accion, 'tarea_id', v_tarea_id, 'grupo_origen', v_origen, 'grupo_destino', p_nuevo_grupo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_cambio_grupo_alumno(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_whatsapp_grupo_on_tarea_hecha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origen = 'whatsapp_grupo'
     AND NEW.estado = 'hecha'
     AND OLD.estado <> 'hecha'
     AND COALESCE((NEW.metadata->>'auto_cancelada')::boolean, false) = false
     AND NEW.entidad_id IS NOT NULL THEN
    UPDATE public.alumnos
    SET whatsapp_grupo_confirmado = NEW.metadata->>'grupo_destino',
        whatsapp_grupo_sync_at = now(),
        whatsapp_grupo_sync_by = COALESCE(NEW.cerrada_por, auth.uid())
    WHERE id = NEW.entidad_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_whatsapp_grupo_on_tarea_hecha ON public.tareas;
CREATE TRIGGER trg_sync_whatsapp_grupo_on_tarea_hecha
AFTER UPDATE ON public.tareas
FOR EACH ROW EXECUTE FUNCTION public.sync_whatsapp_grupo_on_tarea_hecha();