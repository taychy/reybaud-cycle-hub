-- ROLLBACK de 0114: restaura topes 30/31. PENDIENTE, NO aplicado. Solo afecta el RSVP (event_rsvp_invites y sus dos RPCs).
-- Falla (sin cambiar nada) si ya hay respuestas con más de 30 acompañantes: revisarlas antes.

ALTER TABLE public.event_rsvp_invites
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_guests_count_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_adults_count_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_children_4_9_count_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_invites_under_4_count_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_lunch_guest_limit;
ALTER TABLE public.event_rsvp_invites
  ADD CONSTRAINT event_rsvp_invites_guests_count_check CHECK (guests_count >= 0 AND guests_count <= 30),
  ADD CONSTRAINT event_rsvp_invites_adults_count_check CHECK (adults_count >= 0 AND adults_count <= 30),
  ADD CONSTRAINT event_rsvp_invites_children_4_9_count_check CHECK (children_4_9_count >= 0 AND children_4_9_count <= 30),
  ADD CONSTRAINT event_rsvp_invites_under_4_count_check CHECK (under_4_count >= 0 AND under_4_count <= 30),
  ADD CONSTRAINT event_rsvp_lunch_guest_limit CHECK (adults_count + children_4_9_count + under_4_count <= 31);

CREATE OR REPLACE FUNCTION public.respond_event_rsvp(p_token uuid, p_response text, p_participation_mode text DEFAULT NULL::text, p_guests_count integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.event_rsvp_invites%rowtype;
  v_lunch boolean;
  v_advanced boolean;
BEGIN
  IF p_response NOT IN ('voy', 'no_voy') THEN RAISE EXCEPTION 'Respuesta inválida.'; END IF;
  IF p_response = 'voy' AND p_participation_mode NOT IN ('fondo_y_almuerzo', 'solo_fondo', 'solo_almuerzo') THEN
    RAISE EXCEPTION 'Elegí cómo vas a participar.';
  END IF;
  IF p_guests_count IS NULL OR p_guests_count < 0 OR p_guests_count > 30 THEN
    RAISE EXCEPTION 'Cantidad de acompañantes inválida.';
  END IF;
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace no encontrado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = v_invite.event_id AND COALESCE(e.metadata->>'rsvp_enabled', 'false') = 'true') THEN
    RAISE EXCEPTION 'Confirmación no disponible.';
  END IF;
  v_lunch := p_response = 'voy' AND p_participation_mode IN ('fondo_y_almuerzo', 'solo_almuerzo');
  v_advanced := v_invite.lunch_status IN ('comprobante_informado', 'pago_verificado');
  IF NOT v_lunch AND v_advanced THEN
    RAISE EXCEPTION 'Ya hay un comprobante o pago verificado. Administración debe revisar el cambio.';
  END IF;
  UPDATE public.event_rsvp_invites SET
    response = p_response,
    participation_mode = CASE WHEN p_response = 'voy' THEN p_participation_mode ELSE NULL END,
    guests_count = CASE WHEN v_lunch THEN p_guests_count ELSE 0 END,
    responded_at = now(), updated_at = now(),
    lunch_status = CASE
      WHEN v_lunch AND v_invite.lunch_status = 'sin_interes' THEN 'intencion_confirmada'
      WHEN v_lunch THEN v_invite.lunch_status
      ELSE 'sin_interes' END,
    adults_count = CASE WHEN v_lunch THEN v_invite.adults_count ELSE 1 END,
    children_4_9_count = CASE WHEN v_lunch THEN v_invite.children_4_9_count ELSE 0 END,
    under_4_count = CASE WHEN v_lunch THEN v_invite.under_4_count ELSE 0 END,
    lunch_confirmed_at = CASE WHEN v_lunch THEN v_invite.lunch_confirmed_at ELSE NULL END,
    terms_version = CASE WHEN v_lunch THEN v_invite.terms_version ELSE NULL END,
    terms_accepted_at = CASE WHEN v_lunch THEN v_invite.terms_accepted_at ELSE NULL END,
    terms_text_snapshot = CASE WHEN v_lunch THEN v_invite.terms_text_snapshot ELSE NULL END
  WHERE id = v_invite.id;
END $function$;

CREATE OR REPLACE FUNCTION public.confirm_event_rsvp_lunch(p_token uuid, p_adults integer, p_children_4_9 integer, p_under_4 integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.event_rsvp_invites%rowtype;
  v_prices public.event_rsvp_settings%rowtype;
  v_policy_version constant text := 'fondazo-almuerzo-v1-2026-11-16';
  v_policy constant text := 'Si cancelás avisando con al menos 5 días de anticipación (hasta el 24/11/2026 inclusive), el importe abonado queda como crédito para consumir en La Carreta del Gato en otra ocasión. Si no asistís el día del evento y no avisás, perdés el 100% del importe abonado. Las cancelaciones avisadas entre el 25 y el 28/11/2026 o el mismo día están pendientes de definición administrativa; no se consideran automáticamente una ausencia sin aviso. El crédito lo administra La Carreta del Gato, no Ciclismo Reybaud.';
  v_next_status text;
BEGIN
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR v_invite.response <> 'voy' OR v_invite.participation_mode NOT IN ('fondo_y_almuerzo', 'solo_almuerzo') THEN
    RAISE EXCEPTION 'Primero confirmá que venís al almuerzo.';
  END IF;
  SELECT * INTO v_prices FROM public.event_rsvp_settings WHERE event_id = v_invite.event_id;
  IF v_prices.prices_confirmed_at IS NULL THEN RAISE EXCEPTION 'Las tarifas todavía no están confirmadas.'; END IF;
  IF p_adults IS NULL OR p_children_4_9 IS NULL OR p_under_4 IS NULL
    OR p_adults < 1 OR p_children_4_9 < 0 OR p_under_4 < 0
    OR p_adults > 30 OR p_children_4_9 > 30 OR p_under_4 > 30 THEN
    RAISE EXCEPTION 'Revisá las cantidades de comensales.';
  END IF;
  IF p_adults + p_children_4_9 + p_under_4 <> v_invite.guests_count + 1 THEN
    RAISE EXCEPTION 'Las cantidades deben coincidir con vos más tus acompañantes.';
  END IF;
  v_next_status := CASE WHEN v_invite.lunch_status IN ('instrucciones_enviadas', 'comprobante_informado', 'pago_verificado')
    THEN v_invite.lunch_status ELSE 'instrucciones_pendientes' END;
  UPDATE public.event_rsvp_invites SET
    adults_count = p_adults, children_4_9_count = p_children_4_9, under_4_count = p_under_4,
    lunch_confirmed_at = COALESCE(v_invite.lunch_confirmed_at, now()),
    terms_version = v_policy_version, terms_accepted_at = now(), terms_text_snapshot = v_policy,
    lunch_status = v_next_status, updated_at = now()
  WHERE id = v_invite.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment)
  VALUES (v_invite.event_id, v_invite.id, v_invite.lunch_status, v_next_status,
    'El participante confirmó comensales y aceptó ' || v_policy_version);
END $function$;

-- Permisos idénticos a los vigentes (sin PUBLIC; anon/authenticated/service_role).
REVOKE ALL ON FUNCTION public.respond_event_rsvp(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_event_rsvp(uuid, text, text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_event_rsvp_lunch(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_event_rsvp_lunch(uuid, integer, integer, integer) TO anon, authenticated, service_role;
