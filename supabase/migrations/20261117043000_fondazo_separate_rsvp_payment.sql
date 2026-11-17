-- Fondazo 2026: la encuesta solo confirma asistencia. Guarda los asistentes
-- y comensales con un clic, sin pasos de transferencia ni aceptación de cobro.
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
  v_adults integer := 1;
  v_children integer := 0;
  v_under4 integer := 0;
  v_attendees jsonb := '[]'::jsonb;
  v_changed boolean;
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
    IF v_lunch THEN
      v_lunch_guests:=v_lunch_guests+1;
      v_adults:=v_adults+1; -- Todos los amigos ciclistas invitados son adultos
      v_attendees:=v_attendees || jsonb_build_array(
        jsonb_build_object('name',v_name,'category','adult','is_cyclist',true));
    END IF;
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
    v_attendees:=v_attendees || jsonb_build_array(jsonb_build_object('name',v_name,'category',v_category,'is_cyclist',false));
    v_lunch_guests:=v_lunch_guests+1;
    IF v_category='adult' THEN v_adults:=v_adults+1;
    ELSIF v_category='child_4_9' THEN v_children:=v_children+1;
    ELSE v_under4:=v_under4+1; END IF;
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
  v_changed := v_invite.cyclist_guests IS DISTINCT FROM v_cyclists
    OR v_invite.non_cyclist_guests IS DISTINCT FROM v_non_cyclists
    OR v_invite.response IS DISTINCT FROM p_response
    OR v_invite.participation_mode IS DISTINCT FROM
      (CASE WHEN p_response='voy' THEN p_mode ELSE NULL END);
  -- La encuesta guarda de una vez nombres, categorías y cantidades.
  -- No acepta condiciones ni registra transferencias. El pago es posterior.
  UPDATE public.event_rsvp_invites SET
    cyclist_guests=v_cyclists, non_cyclist_guests=v_non_cyclists,
    guests_count=CASE WHEN p_response='voy' AND p_mode IN ('fondo_y_almuerzo','solo_almuerzo')
      THEN v_lunch_guests ELSE 0 END,
    lunch_attendees=CASE WHEN p_response='voy' AND p_mode IN ('fondo_y_almuerzo','solo_almuerzo')
      THEN v_attendees ELSE '[]'::jsonb END,
    adults_count=v_adults, children_4_9_count=v_children, under_4_count=v_under4,
    lunch_confirmed_at=CASE WHEN v_changed THEN NULL ELSE lunch_confirmed_at END,
    terms_version=CASE WHEN v_changed THEN NULL ELSE terms_version END,
    terms_accepted_at=CASE WHEN v_changed THEN NULL ELSE terms_accepted_at END,
    terms_text_snapshot=CASE WHEN v_changed THEN NULL ELSE terms_text_snapshot END,
    lunch_status=CASE WHEN v_changed THEN
      (CASE WHEN p_response='voy' AND p_mode IN ('fondo_y_almuerzo','solo_almuerzo')
        THEN 'intencion_confirmada' ELSE 'sin_interes' END)
      ELSE lunch_status END,
    updated_at=now()
  WHERE id=v_invite.id;
END $function$;

-- Estado de pago manual: documento/comprobante y tarifas verificadas,
-- sin exigir un segundo submit del participante en la encuesta.
CREATE OR REPLACE FUNCTION public.admin_set_event_rsvp_lunch_status(p_invite_id uuid, p_status text, p_comment text, p_receipt_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_invite public.event_rsvp_invites%rowtype;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF p_status NOT IN ('intencion_confirmada', 'instrucciones_pendientes', 'instrucciones_enviadas', 'comprobante_informado', 'pago_verificado') THEN
    RAISE EXCEPTION 'Estado inválido.';
  END IF;
  IF BTRIM(COALESCE(p_comment, '')) = '' THEN RAISE EXCEPTION 'Agregá un comentario de auditoría.'; END IF;
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR v_invite.response <> 'voy' OR v_invite.participation_mode NOT IN ('fondo_y_almuerzo', 'solo_almuerzo') THEN
    RAISE EXCEPTION 'La persona no tiene interés vigente en el almuerzo.';
  END IF;
  -- La aceptación de asistencia y la transferencia son fases separadas.
  -- Verificar solo después de recibir comprobante y reconfirmar importe.
  IF p_status='pago_verificado' AND NOT EXISTS (
    SELECT 1 FROM public.event_rsvp_settings s WHERE s.event_id=v_invite.event_id AND s.prices_confirmed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Confirmá primero las tarifas del restaurante.'; END IF;
  IF p_status='pago_verificado' AND
     BTRIM(COALESCE(p_receipt_reference, v_invite.receipt_reference, ''))='' THEN
    RAISE EXCEPTION 'Para verificar el pago, registrá referencia del comprobante recibido por WhatsApp.'; END IF;
  UPDATE public.event_rsvp_invites SET lunch_status = p_status,
    lunch_admin_comment = BTRIM(p_comment), receipt_reference = COALESCE(NULLIF(BTRIM(p_receipt_reference), ''), v_invite.receipt_reference),
    lunch_status_changed_at = now(), lunch_status_changed_by = v_actor, updated_at = now()
  WHERE id = v_invite.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment, receipt_reference, actor_user_id)
  VALUES (v_invite.event_id, v_invite.id, v_invite.lunch_status, p_status,
    BTRIM(p_comment), NULLIF(BTRIM(p_receipt_reference), ''), v_actor);
END $function$;
