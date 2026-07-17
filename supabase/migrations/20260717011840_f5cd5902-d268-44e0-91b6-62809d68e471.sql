ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS estado_publicacion text NOT NULL DEFAULT 'publicado'
    CHECK (estado_publicacion IN ('borrador','proximamente','publicado','cerrado')),
  ADD COLUMN IF NOT EXISTS waitlist_habilitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waitlist_mensaje text,
  ADD COLUMN IF NOT EXISTS waitlist_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.waitlist_question_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  preguntas jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_question_templates TO authenticated;
GRANT ALL ON public.waitlist_question_templates TO service_role;

ALTER TABLE public.waitlist_question_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan plantillas waitlist"
  ON public.waitlist_question_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.event_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  email text NOT NULL,
  telefono text,
  dni text,
  respuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'nuevo'
    CHECK (estado IN ('nuevo','contactado','convertido','descartado')),
  admin_notas text,
  contactado_por uuid,
  contactado_at timestamptz,
  origen text DEFAULT 'formulario_web',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_waitlist_entries_event_email_key
  ON public.event_waitlist_entries (event_id, lower(email));
CREATE INDEX IF NOT EXISTS event_waitlist_entries_event_estado_idx
  ON public.event_waitlist_entries (event_id, estado);
CREATE INDEX IF NOT EXISTS event_waitlist_entries_alumno_idx
  ON public.event_waitlist_entries (alumno_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_waitlist_entries TO authenticated;
GRANT ALL ON public.event_waitlist_entries TO service_role;

ALTER TABLE public.event_waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan anotados waitlist"
  ON public.event_waitlist_entries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Alumnos ven sus propias entradas"
  ON public.event_waitlist_entries FOR SELECT
  TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_waitlist_entries_updated_at ON public.event_waitlist_entries;
CREATE TRIGGER trg_waitlist_entries_updated_at
BEFORE UPDATE ON public.event_waitlist_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_waitlist();

DROP TRIGGER IF EXISTS trg_waitlist_templates_updated_at ON public.waitlist_question_templates;
CREATE TRIGGER trg_waitlist_templates_updated_at
BEFORE UPDATE ON public.waitlist_question_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_waitlist();

CREATE OR REPLACE FUNCTION public.submit_waitlist_entry(
  p_event_id uuid,
  p_nombre text,
  p_email text,
  p_telefono text DEFAULT NULL,
  p_dni text DEFAULT NULL,
  p_respuestas jsonb DEFAULT '{}'::jsonb,
  p_alumno_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event record;
  v_entry_id uuid;
  v_email text;
  v_nombre text;
BEGIN
  SELECT id, estado_publicacion, waitlist_habilitada, title
    INTO v_event FROM public.events WHERE id = p_event_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Evento no encontrado'); END IF;
  IF NOT v_event.waitlist_habilitada THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La lista de espera no está habilitada para este evento');
  END IF;
  IF v_event.estado_publicacion NOT IN ('proximamente','publicado') THEN
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

GRANT EXECUTE ON FUNCTION public.submit_waitlist_entry(uuid, text, text, text, text, jsonb, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.count_new_waitlist_entries()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COUNT(*)::integer FROM public.event_waitlist_entries WHERE estado = 'nuevo'; $$;

GRANT EXECUTE ON FUNCTION public.count_new_waitlist_entries() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_waitlist_meta(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event record;
BEGIN
  SELECT id, title, image_url, estado_publicacion, waitlist_habilitada, waitlist_mensaje, waitlist_questions
    INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT v_event.waitlist_habilitada THEN RETURN NULL; END IF;
  IF v_event.estado_publicacion NOT IN ('proximamente','publicado') THEN RETURN NULL; END IF;
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

GRANT EXECUTE ON FUNCTION public.get_event_waitlist_meta(uuid) TO anon, authenticated;