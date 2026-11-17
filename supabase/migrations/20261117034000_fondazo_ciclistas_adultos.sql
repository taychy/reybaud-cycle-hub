-- Fondazo 29/11/2026: todos los amigos ciclistas son adultos.
-- Aplica a cualquier cliente, incluso PWA antiguas, sin cambiar pagos ni asistencia.
DO $guard$
BEGIN
 IF EXISTS (SELECT 1 FROM public.event_rsvp_invites
            WHERE jsonb_array_length(cyclist_guests) > 0
            AND jsonb_array_length(jsonb_path_query_array(cyclist_guests,
                '$[*] ? (@.category == "adult")')) <> jsonb_array_length(cyclist_guests)) THEN
   RAISE EXCEPTION 'Hay ciclistas invitados con categoría no adulta: revisar reservas antes de migrar.';
 END IF;
END $guard$;

ALTER TABLE public.event_rsvp_invites
DROP CONSTRAINT IF EXISTS event_rsvp_all_cyclists_adults;
ALTER TABLE public.event_rsvp_invites
ADD CONSTRAINT event_rsvp_all_cyclists_adults
CHECK (
 jsonb_array_length(jsonb_path_query_array(cyclist_guests,
  '$[*] ? (@.category == "adult")')) = jsonb_array_length(cyclist_guests)
);

CREATE OR REPLACE FUNCTION public.respond_event_rsvp_with_guest_types(p_token uuid, p_response text, p_mode text, p_cyclists jsonb, p_non_cyclists jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    -- Los amigos ciclistas son exclusivamente adultos; se rechazan
    -- categorías infantiles incluso en versiones antiguas de la PWA.
    IF v_item ? 'category' AND v_item->>'category' <> 'adult' THEN
      RAISE EXCEPTION 'Los amigos ciclistas invitados deben ser adultos.';
    END IF;
    v_category:='adult';
    IF jsonb_typeof(v_item->'lunch') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Indicá si el ciclista también viene a la parrilla.'; END IF;
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
