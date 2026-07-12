
-- 1) SECURITY DEFINER views → security_invoker
ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = on);
ALTER VIEW public.coaches_public SET (security_invoker = on);
ALTER VIEW public.event_participants_ranking SET (security_invoker = on);
ALTER VIEW public.emisor_facturado_anual SET (security_invoker = on);
ALTER VIEW public.v_ingresos_netos SET (security_invoker = on);
ALTER VIEW public.v_reservation_account SET (security_invoker = on);
ALTER VIEW public.vw_pagos_por_cobrar SET (security_invoker = on);
ALTER VIEW public.vw_bajas_metricas_mensuales SET (security_invoker = on);

-- 2) event_survey_tokens: quitar SELECT público y exponer RPCs seguras
DROP POLICY IF EXISTS "Public can read token for validation" ON public.event_survey_tokens;

CREATE OR REPLACE FUNCTION public.validate_survey_token(_token text)
RETURNS TABLE (
  survey_id uuid,
  event_id uuid,
  alumno_id uuid,
  external_participant_id uuid,
  recipient_name text,
  recipient_email text,
  used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT survey_id, event_id, alumno_id, external_participant_id,
         recipient_name, recipient_email, used_at
    FROM public.event_survey_tokens
   WHERE token = _token
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_survey_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_survey_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_survey_token(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated int;
BEGIN
  UPDATE public.event_survey_tokens
     SET used_at = COALESCE(used_at, now())
   WHERE token = _token;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_survey_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_survey_token(text) TO anon, authenticated;
