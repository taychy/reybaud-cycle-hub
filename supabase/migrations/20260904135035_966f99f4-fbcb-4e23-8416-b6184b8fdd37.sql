ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS recibe_entrenamientos_email boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.weekly_training_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  semana_inicio date NOT NULL,
  semana_fin date NOT NULL,
  modo text NOT NULL CHECK (modo IN ('manual','automatico')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','failed','skipped')),
  message_id text,
  subject text,
  recipient_email text,
  entrenamientos_count integer NOT NULL DEFAULT 0,
  grupo text,
  enviado_por uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_training_email_sends_auto_uq
  ON public.weekly_training_email_sends (alumno_id, semana_inicio)
  WHERE modo = 'automatico' AND status = 'queued';

CREATE INDEX IF NOT EXISTS weekly_training_email_sends_alumno_idx
  ON public.weekly_training_email_sends (alumno_id, semana_inicio DESC);

GRANT SELECT ON public.weekly_training_email_sends TO authenticated;
GRANT ALL ON public.weekly_training_email_sends TO service_role;

ALTER TABLE public.weekly_training_email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view weekly training sends" ON public.weekly_training_email_sends;
CREATE POLICY "Admins can view weekly training sends"
  ON public.weekly_training_email_sends
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_entrenamientos_semana_alumno(
  _alumno_id uuid,
  _desde date,
  _hasta date
)
RETURNS TABLE (
  id uuid,
  fecha date,
  titulo text,
  descripcion text,
  tipo public.tipo_entrenamiento,
  grupo public.grupo_ciclismo,
  link_archivo text,
  resistencia text,
  tecnica text,
  intensidad text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grupo public.grupo_ciclismo;
  _user_id uuid;
BEGIN
  SELECT a.grupo, a.user_id INTO _grupo, _user_id
  FROM public.alumnos a WHERE a.id = _alumno_id;

  IF _grupo IS NULL AND _user_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND (_user_id IS NULL OR _user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT e.id, e.fecha, e.titulo, e.descripcion, e.tipo, e.grupo,
         e.link_archivo, e.resistencia, e.tecnica, e.intensidad
  FROM public.entrenamientos e
  WHERE e.visible = true
    AND e.fecha >= _desde
    AND e.fecha <= _hasta
    AND (
      CASE WHEN _grupo IN ('Personalizado','Aspirantes')
        THEN e.alumno_id = _alumno_id
        ELSE e.grupo = _grupo AND e.alumno_id IS NULL
      END
    )
  ORDER BY e.fecha ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_entrenamientos_semana_alumno(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_entrenamientos_semana_alumno(uuid, date, date) TO authenticated, service_role;