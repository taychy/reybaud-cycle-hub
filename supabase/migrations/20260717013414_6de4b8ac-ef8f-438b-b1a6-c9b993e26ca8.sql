
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_estado_publicacion_check;
ALTER TABLE public.events ADD CONSTRAINT events_estado_publicacion_check
  CHECK (estado_publicacion IN ('borrador','proximamente','publicado','agotado','cerrado'));

DROP FUNCTION IF EXISTS public.submit_waitlist_entry(uuid,text,text,text,text,jsonb,uuid,text);

CREATE OR REPLACE FUNCTION public.submit_waitlist_entry(
  p_event_id uuid, p_nombre text, p_email text, p_telefono text, p_dni text,
  p_respuestas jsonb, p_alumno_id uuid, p_user_agent text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event record; v_entry_id uuid; v_email text; v_nombre text;
BEGIN
  SELECT id, estado_publicacion, waitlist_habilitada, title
    INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Evento no encontrado'); END IF;
  IF NOT v_event.waitlist_habilitada THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La lista de espera no está habilitada para este evento');
  END IF;
  IF v_event.estado_publicacion NOT IN ('proximamente','publicado','agotado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este evento no acepta anotaciones');
  END IF;
  v_email := lower(trim(coalesce(p_email, '')));
  v_nombre := trim(coalesce(p_nombre, ''));
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email inválido');
  END IF;
  IF length(v_nombre) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nombre requerido');
  END IF;
  INSERT INTO public.event_waitlist_entries
    (event_id, alumno_id, nombre, email, telefono, dni, respuestas, user_agent)
  VALUES (p_event_id, p_alumno_id, v_nombre, v_email, p_telefono, p_dni,
          COALESCE(p_respuestas, '{}'::jsonb), p_user_agent)
  ON CONFLICT (event_id, lower(email)) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        telefono = COALESCE(EXCLUDED.telefono, public.event_waitlist_entries.telefono),
        dni = COALESCE(EXCLUDED.dni, public.event_waitlist_entries.dni),
        respuestas = EXCLUDED.respuestas,
        alumno_id = COALESCE(EXCLUDED.alumno_id, public.event_waitlist_entries.alumno_id),
        updated_at = now()
  RETURNING id INTO v_entry_id;
  RETURN jsonb_build_object('ok', true, 'id', v_entry_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_waitlist_entry(uuid,text,text,text,text,jsonb,uuid,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_event_waitlist_meta(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event record;
BEGIN
  SELECT id, title, image_url, estado_publicacion, waitlist_habilitada, waitlist_mensaje, waitlist_questions
    INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT v_event.waitlist_habilitada THEN RETURN NULL; END IF;
  IF v_event.estado_publicacion NOT IN ('proximamente','publicado','agotado') THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', v_event.id,
    'title', v_event.title,
    'image_url', v_event.image_url,
    'estado_publicacion', v_event.estado_publicacion,
    'waitlist_mensaje', v_event.waitlist_mensaje,
    'waitlist_questions', v_event.waitlist_questions
  );
END;
$$;
