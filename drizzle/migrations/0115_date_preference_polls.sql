-- Encuestas de preferencia de fecha por destinatario (independientes de encuestas previas).
CREATE TABLE IF NOT EXISTS public.date_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,60}$'),
  event_id uuid,
  title text NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.date_poll_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.date_polls(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text,
  alumno_id uuid,
  is_test boolean NOT NULL DEFAULT false,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  choice text,
  suggestion text CHECK (suggestion IS NULL OR length(suggestion) <= 500),
  responded_at timestamptz,
  change_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, recipient_email, is_test)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.date_polls, public.date_poll_invites TO authenticated;
GRANT ALL ON public.date_polls, public.date_poll_invites TO service_role;
ALTER TABLE public.date_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_poll_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin date_polls" ON public.date_polls;
CREATE POLICY "admin date_polls" ON public.date_polls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin read date_poll_invites" ON public.date_poll_invites;
CREATE POLICY "admin read date_poll_invites" ON public.date_poll_invites FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Lectura por token: nunca registra voto.
CREATE OR REPLACE FUNCTION public.get_date_poll_by_token(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('title', p.title, 'question', p.question, 'options', p.options, 'is_open', p.is_open,
    'name', i.recipient_name, 'choice', i.choice, 'suggestion', i.suggestion, 'responded_at', i.responded_at)
  FROM public.date_poll_invites i JOIN public.date_polls p ON p.id = i.poll_id
  WHERE p_token ~ '^[a-f0-9]{32,128}$' AND i.token = p_token;
$$;

-- Voto explícito (POST desde la landing). Un voto por invitación; se puede cambiar.
CREATE OR REPLACE FUNCTION public.submit_date_poll_vote(p_token text, p_choice text, p_suggestion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv public.date_poll_invites; v_poll public.date_polls; v_opt jsonb; v_sug text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{32,128}$' THEN RAISE EXCEPTION 'invalid_token'; END IF;
  SELECT * INTO v_inv FROM public.date_poll_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_poll FROM public.date_polls WHERE id = v_inv.poll_id;
  IF NOT v_poll.is_open THEN RAISE EXCEPTION 'poll_closed'; END IF;
  SELECT o INTO v_opt FROM jsonb_array_elements(v_poll.options) o WHERE o->>'value' = p_choice;
  IF v_opt IS NULL THEN RAISE EXCEPTION 'invalid_choice'; END IF;
  v_sug := nullif(btrim(coalesce(p_suggestion, '')), '');
  IF coalesce((v_opt->>'needs_text')::boolean, false) THEN
    IF v_sug IS NULL THEN RAISE EXCEPTION 'suggestion_required'; END IF;
    IF length(v_sug) > 500 THEN RAISE EXCEPTION 'suggestion_too_long'; END IF;
  ELSE v_sug := NULL; END IF;
  UPDATE public.date_poll_invites SET choice = p_choice, suggestion = v_sug,
    change_count = change_count + CASE WHEN responded_at IS NULL THEN 0 ELSE 1 END,
    responded_at = now() WHERE id = v_inv.id;
  RETURN jsonb_build_object('ok', true, 'choice', p_choice, 'suggestion', v_sug, 'name', v_inv.recipient_name);
END $$;

REVOKE ALL ON FUNCTION public.get_date_poll_by_token(text), public.submit_date_poll_vote(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_date_poll_by_token(text), public.submit_date_poll_vote(text, text, text) TO anon, authenticated, service_role;

INSERT INTO public.date_polls (slug, event_id, title, question, options)
VALUES ('san-luis-2027-fechas', '408a8eb8-fb62-4a50-ad6d-040bd5716797', 'Training Camp San Luis 2027',
  '¿Qué fecha te queda mejor para el Training Camp San Luis 2027?',
  '[{"value":"enero_17_24","label":"17 al 24 de enero"},{"value":"febrero_18_21","label":"18 al 21 de febrero"},{"value":"otra","label":"Otra fecha","needs_text":true}]'::jsonb)
ON CONFLICT (slug) DO NOTHING;