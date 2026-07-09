
CREATE TABLE public.event_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL DEFAULT 'Encuesta de cierre',
  descripcion TEXT,
  preguntas JSONB NOT NULL DEFAULT '[]'::jsonb,
  anonima BOOLEAN NOT NULL DEFAULT false,
  activa BOOLEAN NOT NULL DEFAULT true,
  fecha_envio_programada TIMESTAMPTZ,
  enviada_at TIMESTAMPTZ,
  enviada_por UUID,
  recipients_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_surveys TO authenticated;
GRANT ALL ON public.event_surveys TO service_role;

ALTER TABLE public.event_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage event surveys"
  ON public.event_surveys FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Participants can view active surveys of their events"
  ON public.event_surveys FOR SELECT
  USING (
    activa = true AND EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = event_surveys.event_id
        AND lower(ep.email) = lower(auth.email())
    )
  );

CREATE TABLE public.event_survey_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES public.event_surveys(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  alumno_id UUID,
  external_participant_id UUID,
  respondent_name TEXT,
  respondent_email TEXT,
  respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
  nps INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_survey_responses TO authenticated;
GRANT SELECT, INSERT ON public.event_survey_responses TO anon;
GRANT ALL ON public.event_survey_responses TO service_role;

ALTER TABLE public.event_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all responses"
  ON public.event_survey_responses FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can submit a response"
  ON public.event_survey_responses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users see own responses"
  ON public.event_survey_responses FOR SELECT
  USING (
    lower(coalesce(respondent_email,'')) = lower(coalesce(auth.email(),''))
  );

CREATE TABLE public.event_survey_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES public.event_surveys(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  alumno_id UUID,
  external_participant_id UUID,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.event_survey_tokens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_survey_tokens TO authenticated;
GRANT ALL ON public.event_survey_tokens TO service_role;

ALTER TABLE public.event_survey_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tokens"
  ON public.event_survey_tokens FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read token for validation"
  ON public.event_survey_tokens FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.update_event_surveys_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_event_surveys_updated_at BEFORE UPDATE ON public.event_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_event_surveys_updated_at();

CREATE TRIGGER trg_event_survey_responses_updated_at BEFORE UPDATE ON public.event_survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_event_surveys_updated_at();

CREATE INDEX idx_event_surveys_event ON public.event_surveys(event_id);
CREATE INDEX idx_event_surveys_scheduled ON public.event_surveys(fecha_envio_programada) WHERE enviada_at IS NULL;
CREATE INDEX idx_event_survey_responses_survey ON public.event_survey_responses(survey_id);
CREATE INDEX idx_event_survey_tokens_survey ON public.event_survey_tokens(survey_id);
