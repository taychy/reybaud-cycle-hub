-- Identifica el token de prueba en la propia encuesta. Sólo se usa para
-- habilitar correos TEST a una casilla fija, nunca para activar mailing real.
CREATE OR REPLACE FUNCTION public.get_event_rsvp_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.event_rsvp_invites%rowtype;
  v_event public.events%rowtype;
  v_prices public.event_rsvp_settings%rowtype;
BEGIN
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = v_invite.event_id
    AND COALESCE(metadata->>'rsvp_enabled', 'false') = 'true';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_prices FROM public.event_rsvp_settings WHERE event_id = v_invite.event_id;
  RETURN jsonb_build_object(
    'event', jsonb_build_object('title', v_event.title, 'date', v_event.date, 'location', v_event.location),
    'name', v_invite.recipient_name,
    'is_test', v_invite.is_test,
    'response', v_invite.response,
    'participation_mode', v_invite.participation_mode,
    'guests_count', v_invite.guests_count,
    'cyclist_guests', v_invite.cyclist_guests,
    'non_cyclist_guests', v_invite.non_cyclist_guests,
    'lunch', jsonb_build_object(
      'status', v_invite.lunch_status,
      'attendees', v_invite.lunch_attendees,
      'adults_count', v_invite.adults_count,
      'children_4_9_count', v_invite.children_4_9_count,
      'under_4_count', v_invite.under_4_count,
      'terms_version', v_invite.terms_version,
      'terms_accepted_at', v_invite.terms_accepted_at
    ),
    'prices', CASE WHEN v_prices.prices_confirmed_at IS NULL THEN jsonb_build_object('prices_confirmed_at', null)
      ELSE jsonb_build_object(
        'adult_price', v_prices.adult_price,
        'child_4_9_price', v_prices.child_4_9_price,
        'under_4_price', v_prices.under_4_price,
        'prices_confirmed_at', v_prices.prices_confirmed_at
      ) END
  );
END $function$;
