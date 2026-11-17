-- Fondazo 29/11/2026 · comensales individualizados. Solo modifica el sistema RSVP.
-- La reserva permanece preliminar hasta que administración verifique el pago directo al restaurante.
ALTER TABLE public.event_rsvp_invites
  ADD COLUMN IF NOT EXISTS lunch_attendees jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.event_rsvp_invites
  DROP CONSTRAINT IF EXISTS event_rsvp_attendees_array_check;
ALTER TABLE public.event_rsvp_invites
  ADD CONSTRAINT event_rsvp_attendees_array_check
  CHECK (jsonb_typeof(lunch_attendees) = 'array' AND jsonb_array_length(lunch_attendees) <= 500);

-- Si cambia la composición de la reserva antes del comprobante, hay que volver a aceptar
-- los datos y las condiciones; nunca cambiar una reserva ya validada sin administración.
CREATE OR REPLACE FUNCTION public.event_rsvp_reset_lunch_on_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_changed boolean;
BEGIN
  v_changed :=
    NEW.response IS DISTINCT FROM OLD.response OR
    NEW.participation_mode IS DISTINCT FROM OLD.participation_mode OR
    NEW.guests_count IS DISTINCT FROM OLD.guests_count;
  IF NOT v_changed THEN RETURN NEW; END IF;
  IF OLD.lunch_status IN ('comprobante_informado', 'pago_verificado') THEN
    RAISE EXCEPTION 'Ya hay un comprobante o un pago validado. Contactá a administración para modificar la reserva.';
  END IF;
  NEW.lunch_attendees := '[]'::jsonb;
  NEW.lunch_confirmed_at := NULL;
  NEW.terms_version := NULL;
  NEW.terms_accepted_at := NULL;
  NEW.terms_text_snapshot := NULL;
  NEW.adults_count := 1;
  NEW.children_4_9_count := 0;
  NEW.under_4_count := 0;
  IF NEW.response = 'voy' AND NEW.participation_mode IN ('solo_almuerzo', 'fondo_y_almuerzo') THEN
    NEW.lunch_status := 'intencion_confirmada';
  ELSE
    NEW.lunch_status := 'sin_interes';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_event_rsvp_reset_lunch ON public.event_rsvp_invites;
CREATE TRIGGER trg_event_rsvp_reset_lunch
BEFORE UPDATE OF response, participation_mode, guests_count
ON public.event_rsvp_invites FOR EACH ROW
EXECUTE FUNCTION public.event_rsvp_reset_lunch_on_change();

-- El titular es siempre el adulto n.º 1 y se identifica por el nombre de la invitación.
-- Cada acompañante declara nombre/apellido y grupo etario. Se calculan cantidades
-- exclusivamente en el servidor y se usa el RPC existente para registrar aceptación y auditoría.
CREATE OR REPLACE FUNCTION public.confirm_event_rsvp_lunch_named(p_token uuid, p_guests jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.event_rsvp_invites%ROWTYPE;
  v_item jsonb;
  v_name text;
  v_type text;
  v_normalized jsonb := '[]'::jsonb;
  v_adults integer := 1;
  v_children integer := 0;
  v_under4 integer := 0;
BEGIN
  IF p_guests IS NULL OR jsonb_typeof(p_guests) <> 'array' OR jsonb_array_length(p_guests) > 500 THEN
    RAISE EXCEPTION 'Revisá los acompañantes.';
  END IF;
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace no encontrado.'; END IF;
  IF v_invite.response <> 'voy' OR v_invite.participation_mode NOT IN ('solo_almuerzo','fondo_y_almuerzo') THEN
    RAISE EXCEPTION 'Primero confirmá que venís al almuerzo.';
  END IF;
  IF v_invite.lunch_status IN ('comprobante_informado','pago_verificado') THEN
    RAISE EXCEPTION 'La reserva tiene un comprobante o pago registrado. Consultá a administración para cambiarla.';
  END IF;
  IF jsonb_array_length(p_guests) <> v_invite.guests_count THEN
    RAISE EXCEPTION 'La cantidad de acompañantes no coincide con tu respuesta.';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_guests)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'Completá los datos de cada acompañante.'; END IF;
    v_name := btrim(COALESCE(v_item->>'name',''));
    v_type := COALESCE(v_item->>'category','');
    IF char_length(v_name) < 2 OR char_length(v_name) > 100
       OR v_type NOT IN ('adult','child_4_9','under_4') THEN
      RAISE EXCEPTION 'Completá nombre y categoría de cada acompañante.';
    END IF;
    IF v_type='adult' THEN v_adults:=v_adults+1;
    ELSIF v_type='child_4_9' THEN v_children:=v_children+1;
    ELSE v_under4:=v_under4+1; END IF;
    v_normalized:=v_normalized || jsonb_build_array(jsonb_build_object('name',v_name,'category',v_type));
  END LOOP;
  -- Valida precios, cantidades y condiciones; deja auditoría de aceptación.
  PERFORM public.confirm_event_rsvp_lunch(p_token, v_adults, v_children, v_under4);
  UPDATE public.event_rsvp_invites SET lunch_attendees=v_normalized, updated_at=now()
  WHERE id=v_invite.id;
END $function$;
REVOKE ALL ON FUNCTION public.confirm_event_rsvp_lunch_named(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_event_rsvp_lunch_named(uuid,jsonb)
TO anon, authenticated, service_role;
COMMENT ON COLUMN public.event_rsvp_invites.lunch_attendees IS
  'Solo acompañantes no ciclistas que van a parrilla; nombre y grupo etario. El titular adulto se infiere de recipient_name. No confundir con los diez amigos ciclistas sujetos a aprobación de Claudio.';

-- Una pantalla sin sesión recibe los nombres solamente al poseer el token secreto;
-- el resto del estado y los controles permanecen idénticos.
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
    'response', v_invite.response,
    'participation_mode', v_invite.participation_mode,
    'guests_count', v_invite.guests_count,
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
END $function$
;

-- Resumen de nombres para el panel administrativo. Nunca expone tokens ni registros de test.
CREATE OR REPLACE FUNCTION public.get_event_rsvp_guest_names_admin(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor,'admin') THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  SELECT COALESCE(jsonb_object_agg(i.id::text, i.lunch_attendees), '{}'::jsonb)
  INTO v_result FROM public.event_rsvp_invites i WHERE i.event_id=p_event_id AND NOT i.is_test;
  RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.get_event_rsvp_guest_names_admin(uuid) FROM PUBLIC;
-- En este proyecto hay GRANT EXECUTE explícito por defecto para anon: revocarlo también.
REVOKE ALL ON FUNCTION public.get_event_rsvp_guest_names_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_guest_names_admin(uuid) TO authenticated, service_role;
