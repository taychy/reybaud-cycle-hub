
CREATE OR REPLACE FUNCTION public.get_survey_by_token(_token text)
RETURNS TABLE(
  id uuid,
  event_id uuid,
  titulo text,
  descripcion text,
  preguntas jsonb,
  anonima boolean,
  activa boolean,
  event_title text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.event_id, s.titulo, s.descripcion, s.preguntas, s.anonima, s.activa, e.title AS event_title
    FROM public.event_survey_tokens t
    JOIN public.event_surveys s ON s.id = t.survey_id
    LEFT JOIN public.events e ON e.id = s.event_id
   WHERE t.token = _token
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_survey_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_survey_by_token(text) TO anon, authenticated;
