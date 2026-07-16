
-- 1) search_path on function
ALTER FUNCTION public.enqueue_reservation_payment_facturacion() SET search_path = public;

-- 2) security_invoker on the remaining view
ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = on);

-- 3) coaches: drop anon read policy; expose safe view instead
DROP POLICY IF EXISTS "Anyone can view active coaches for booking" ON public.coaches;
ALTER VIEW public.coaches_public SET (security_invoker = off);
GRANT SELECT ON public.coaches_public TO anon, authenticated;

-- 4) entrenamientos: drop public read policy (authenticated policies remain)
DROP POLICY IF EXISTS "Anyone can view visible entrenamientos" ON public.entrenamientos;

-- 5) event_survey_responses: replace open insert with token-gated RPC
DROP POLICY IF EXISTS "Anyone can submit a response" ON public.event_survey_responses;

CREATE OR REPLACE FUNCTION public.submit_survey_response(
  _token text,
  _respuestas jsonb,
  _nps integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.event_survey_tokens%ROWTYPE;
  v_survey public.event_surveys%ROWTYPE;
  v_response_id uuid;
BEGIN
  SELECT * INTO v_tok FROM public.event_survey_tokens WHERE token = _token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF v_tok.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'token_already_used';
  END IF;

  SELECT * INTO v_survey FROM public.event_surveys WHERE id = v_tok.survey_id;
  IF NOT FOUND OR NOT COALESCE(v_survey.activa, false) THEN
    RAISE EXCEPTION 'survey_not_available';
  END IF;

  INSERT INTO public.event_survey_responses (
    survey_id, event_id, alumno_id, external_participant_id,
    respondent_name, respondent_email, respuestas, nps
  ) VALUES (
    v_tok.survey_id,
    v_tok.event_id,
    v_tok.alumno_id,
    v_tok.external_participant_id,
    CASE WHEN v_survey.anonima THEN NULL ELSE v_tok.recipient_name END,
    CASE WHEN v_survey.anonima THEN NULL ELSE v_tok.recipient_email END,
    COALESCE(_respuestas, '{}'::jsonb),
    _nps
  )
  RETURNING id INTO v_response_id;

  UPDATE public.event_survey_tokens SET used_at = now() WHERE id = v_tok.id;

  RETURN v_response_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_survey_response(text, jsonb, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_survey_response(text, jsonb, integer) TO anon, authenticated;
