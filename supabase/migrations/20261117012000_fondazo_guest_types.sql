-- Fondazo Reybaud 29/11: separa ciclistas invitados (pendientes de Claudio)
-- de acompañantes NO ciclistas (solo parrilla). No reserva plazas de fondo ni cobra.
ALTER TABLE public.event_rsvp_invites
  ADD COLUMN IF NOT EXISTS cyclist_guests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS non_cyclist_guests jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.event_rsvp_invites
  DROP CONSTRAINT IF EXISTS event_rsvp_cyclists_array_check,
  DROP CONSTRAINT IF EXISTS event_rsvp_non_cyclists_array_check;
ALTER TABLE public.event_rsvp_invites
  ADD CONSTRAINT event_rsvp_cyclists_array_check
    CHECK (jsonb_typeof(cyclist_guests)='array' AND jsonb_array_length(cyclist_guests) <= 10),
  ADD CONSTRAINT event_rsvp_non_cyclists_array_check
    CHECK (jsonb_typeof(non_cyclist_guests)='array' AND jsonb_array_length(non_cyclist_guests) <= 500);
COMMENT ON COLUMN public.event_rsvp_invites.cyclist_guests IS
 'Solicitudes de amigos ciclistas: nombre, almuerzo sí/no, categoría etaria. Todos pendientes de aprobación manual de Claudio; NO son cupos aprobados.';
COMMENT ON COLUMN public.event_rsvp_invites.non_cyclist_guests IS
 'Acompañantes no ciclistas para la parrilla: nombre y categoría etaria; sin cupo comercial.';
COMMENT ON COLUMN public.event_rsvp_invites.lunch_attendees IS
 'Comensales aceptados: no ciclistas y ciclistas invitados que también comen; is_cyclist diferencia ambos grupos. Excluye titular.';

CREATE OR REPLACE FUNCTION public.respond_event_rsvp_with_guest_types(
  p_token uuid, p_response text, p_mode text, p_cyclists jsonb, p_non_cyclists jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.event_rsvp_invites%ROWTYPE;
  v_item jsonb;
  v_name text;
  v_category text;
  v_lunch boolean;
  v_cyclists jsonb := '[]'::jsonb;
  v_non_cyclists jsonb := '[]'::jsonb;
  v_lunch_guests integer := 0;
BEGIN
  IF p_response NOT IN ('voy','no_voy') THEN RAISE EXCEPTION 'Elegí si venís o no.'; END IF;
  IF p_response='voy' AND p_mode NOT IN ('fondo_y_almuerzo','solo_fondo','solo_almuerzo') THEN
    RAISE EXCEPTION 'Elegí cómo vas a participar.';
  END IF;
  IF p_cyclists IS NULL OR jsonb_typeof(p_cyclists) <> 'array'
    OR jsonb_array_length(p_cyclists)>10 OR
    p_non_cyclists IS NULL OR jsonb_typeof(p_non_cyclists)<>'array'
    OR jsonb_array_length(p_non_cyclists)>500 THEN
    RAISE EXCEPTION 'Revisá la cantidad de invitados.';
  END IF;
  IF p_response='no_voy' AND
    (jsonb_array_length(p_cyclists)>0 OR jsonb_array_length(p_non_cyclists)>0) THEN
    RAISE EXCEPTION 'No podés registrar acompañantes si no asistís.';
  END IF;
  IF p_response='voy' AND p_mode='solo_fondo' AND jsonb_array_length(p_non_cyclists)>0 THEN
    RAISE EXCEPTION 'Los acompañantes no ciclistas solo participan del almuerzo.';
  END IF;
  IF p_response='voy' AND p_mode='solo_almuerzo' AND jsonb_array_length(p_cyclists)>0 THEN
    RAISE EXCEPTION 'Para invitar ciclistas al fondo, elegí una opción que incluya fondo.';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cyclists)
  LOOP
    IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'Completá los ciclistas invitados.'; END IF;
    v_name:=btrim(COALESCE(v_item->>'name',''));
    v_category:=COALESCE(v_item->>'category','adult');
    IF jsonb_typeof(v_item->'lunch')<>'boolean' THEN RAISE EXCEPTION 'Indicá si el ciclista también viene a la parrilla.'; END IF;
    v_lunch:=(v_item->>'lunch')::boolean;
    IF length(v_name)<2 OR length(v_name)>100 OR v_category NOT IN ('adult','child_4_9','under_4') THEN
      RAISE EXCEPTION 'Completá nombre y categoría de cada ciclista invitado.';
    END IF;
    IF p_mode='solo_fondo' AND v_lunch THEN RAISE EXCEPTION 'La opción solo fondo no incluye almuerzo.'; END IF;
    v_cyclists:=v_cyclists || jsonb_build_array(jsonb_build_object('name',v_name,'lunch',v_lunch,'category',v_category));
    IF v_lunch THEN v_lunch_guests:=v_lunch_guests+1; END IF;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_non_cyclists)
  LOOP
    IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'Completá los acompañantes.'; END IF;
    v_name:=btrim(COALESCE(v_item->>'name',''));
    v_category:=COALESCE(v_item->>'category','');
    IF length(v_name)<2 OR length(v_name)>100 OR v_category NOT IN ('adult','child_4_9','under_4') THEN
      RAISE EXCEPTION 'Completá nombre y categoría de cada acompañante.';
    END IF;
    v_non_cyclists:=v_non_cyclists || jsonb_build_array(jsonb_build_object('name',v_name,'category',v_category));
    v_lunch_guests:=v_lunch_guests+1;
  END LOOP;
  IF v_lunch_guests>500 THEN RAISE EXCEPTION 'Revisá el total de comensales.'; END IF;
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace no encontrado.'; END IF;
  IF v_invite.lunch_status IN ('comprobante_informado','pago_verificado')
      AND (v_invite.cyclist_guests IS DISTINCT FROM v_cyclists OR
           v_invite.non_cyclist_guests IS DISTINCT FROM v_non_cyclists OR
           v_invite.response IS DISTINCT FROM p_response OR
           v_invite.participation_mode IS DISTINCT FROM p_mode)
  THEN RAISE EXCEPTION 'Ya existe un comprobante o pago registrado. Consultá a administración para modificar la reserva.'; END IF;

  -- Conserva el flujo existente de intención y limpia condiciones ante cambios de asistentes.
  PERFORM public.respond_event_rsvp(p_token, p_response,
    CASE WHEN p_response='voy' THEN p_mode ELSE NULL END,
    CASE WHEN p_response='voy' THEN v_lunch_guests ELSE 0 END
  );
  IF v_invite.cyclist_guests IS DISTINCT FROM v_cyclists OR
     v_invite.non_cyclist_guests IS DISTINCT FROM v_non_cyclists THEN
    UPDATE public.event_rsvp_invites SET
      cyclist_guests=v_cyclists, non_cyclist_guests=v_non_cyclists,
      lunch_attendees='[]'::jsonb,
      lunch_confirmed_at=NULL, terms_version=NULL, terms_accepted_at=NULL, terms_text_snapshot=NULL,
      lunch_status=CASE WHEN p_response='voy' AND p_mode IN ('solo_almuerzo','fondo_y_almuerzo')
        THEN 'intencion_confirmada' ELSE 'sin_interes' END, updated_at=now()
    WHERE id=v_invite.id;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb)
TO anon,authenticated,service_role;

-- El mismo token individual devuelve lo que su titular registró.
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
END $function$
;

-- Antes de aceptar y calcular importe, cotejar exactamente los comensales
-- (incluye ciclistas que eligen parrilla). No se puede inflar ni omitir importes.
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
  v_expected jsonb := '[]'::jsonb;
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

  -- El listado de parrilla es exactamente el de no ciclistas más ciclistas
  -- que también comen: no pueden omitir comensales o duplicarlos por RPC.
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_invite.non_cyclist_guests)
  LOOP
    v_expected := v_expected || jsonb_build_array(
      jsonb_build_object('name', v_item->>'name', 'category', v_item->>'category', 'is_cyclist', false)
    );
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_invite.cyclist_guests)
  LOOP
    IF (v_item->>'lunch')::boolean THEN
      v_expected := v_expected || jsonb_build_array(
        jsonb_build_object('name', v_item->>'name', 'category', v_item->>'category', 'is_cyclist', true)
      );
    END IF;
  END LOOP;
  IF p_guests <> v_expected THEN
    RAISE EXCEPTION 'Actualizá y confirmá primero la cantidad y los tipos de acompañantes.';
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
    v_normalized:=v_normalized || jsonb_build_array(jsonb_build_object('name',v_name,'category',v_type, 'is_cyclist', (v_item->>'is_cyclist')::boolean));
  END LOOP;
  -- Valida precios, cantidades y condiciones; deja auditoría de aceptación.
  PERFORM public.confirm_event_rsvp_lunch(p_token, v_adults, v_children, v_under4);
  UPDATE public.event_rsvp_invites SET lunch_attendees=v_normalized, updated_at=now()
  WHERE id=v_invite.id;
END $function$
;

CREATE OR REPLACE FUNCTION public.get_event_rsvp_guest_types_admin(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor,'admin') THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;
  SELECT COALESCE(jsonb_object_agg(i.id::text,
    jsonb_build_object('cyclists',i.cyclist_guests,'non_cyclists',i.non_cyclist_guests)), '{}'::jsonb)
  INTO v_result FROM public.event_rsvp_invites i
  WHERE i.event_id=p_event_id AND NOT i.is_test;
  RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.get_event_rsvp_guest_types_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_rsvp_guest_types_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_guest_types_admin(uuid) TO authenticated,service_role;
