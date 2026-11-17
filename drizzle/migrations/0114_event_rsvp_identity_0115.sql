-- Fondazo: identidad de RSVP por token y alumno_id; visitantes con datos propios.
-- Nunca vincula una ficha de alumno por email ni acepta reemplazar una identidad vinculada.
-- Idempotente y acotado a event_rsvp_invites y sus RPCs. No toca pagos ni reservas.

ALTER TABLE public.event_rsvp_invites
  ADD COLUMN IF NOT EXISTS lunch_attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cyclist_guests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS non_cyclist_guests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS participant_whatsapp text,
  ADD COLUMN IF NOT EXISTS registration_source text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS participant_first_name text,
  ADD COLUMN IF NOT EXISTS participant_last_name text;

COMMENT ON COLUMN public.event_rsvp_invites.participant_first_name IS
  'Nombre confirmado por token; si alumno_id existe se copia de esa ficha, nunca se infiere por email.';
COMMENT ON COLUMN public.event_rsvp_invites.participant_last_name IS
  'Apellido confirmado por token; si alumno_id existe se copia de esa ficha, nunca se infiere por email.';

CREATE OR REPLACE FUNCTION public.respond_event_rsvp_with_guest_types(
  p_token uuid,
  p_response text,
  p_mode text,
  p_cyclists jsonb,
  p_non_cyclists jsonb,
  p_identity jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite public.event_rsvp_invites%ROWTYPE;
  v_profile public.alumnos%ROWTYPE;
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
  v_fondazo boolean := false;
  v_phone text;
  v_guest_phone text;
  v_first text;
  v_last text;
  v_full_name text;
  v_linked boolean;
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

  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace no encontrado.'; END IF;
  v_fondazo := v_invite.event_id='08fc7e07-10df-4ace-b3ed-a0d581b6f7c9'::uuid;
  v_linked := v_invite.alumno_id IS NOT NULL;

  IF v_linked THEN
    -- El token sólo selecciona la invitación. La identidad viene del alumno_id
    -- ya asociado en servidor; cualquier identidad enviada por el cliente se ignora.
    SELECT * INTO v_profile FROM public.alumnos WHERE id=v_invite.alumno_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La ficha vinculada no está disponible.'; END IF;
    v_first := btrim(coalesce(v_profile.nombre,''));
    v_last := btrim(coalesce(v_profile.apellido,''));
    v_phone := coalesce(v_invite.participant_whatsapp,v_profile.telefono);
  ELSE
    IF p_identity IS NOT NULL AND jsonb_typeof(p_identity) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Revisá los datos de identidad.';
    END IF;
    -- Para compatibilidad con una PWA anterior se reutilizan los datos ya
    -- guardados en ESTA invitación; nunca se busca otra identidad por email.
    v_first := btrim(coalesce(p_identity->>'first_name',v_invite.participant_first_name,''));
    v_last := btrim(coalesce(p_identity->>'last_name',v_invite.participant_last_name,''));
    v_phone := regexp_replace(
      btrim(coalesce(p_identity->>'whatsapp',v_invite.participant_whatsapp,'')),
      '[^+0-9]', '', 'g'
    );
  END IF;

  IF char_length(v_first) NOT BETWEEN 2 AND 70 OR char_length(v_last) NOT BETWEEN 2 AND 70 THEN
    RAISE EXCEPTION 'Completá tu nombre y apellido.';
  END IF;
  IF NOT v_linked AND v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Ingresá tu WhatsApp con código de país, por ejemplo +54 9 11 1234 5678.';
  END IF;
  v_full_name := v_first || ' ' || v_last;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_cyclists)
  LOOP
    IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'Completá los ciclistas invitados.'; END IF;
    v_name:=btrim(COALESCE(v_item->>'name',''));
    v_guest_phone:=regexp_replace(btrim(COALESCE(v_item->>'whatsapp','')), '[^+0-9]', '', 'g');
    IF v_fondazo AND v_guest_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
      RAISE EXCEPTION 'Ingresá el WhatsApp de cada ciclista invitado con código de país.';
    END IF;
    IF v_item ? 'category' AND v_item->>'category' <> 'adult' THEN
      RAISE EXCEPTION 'Los amigos ciclistas invitados deben ser adultos.';
    END IF;
    v_category:='adult';
    IF jsonb_typeof(v_item->'lunch') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Indicá si el ciclista también viene a la parrilla.';
    END IF;
    v_lunch:=(v_item->>'lunch')::boolean;
    IF length(v_name)<2 OR length(v_name)>100 THEN
      RAISE EXCEPTION 'Completá nombre y apellido de cada ciclista invitado.';
    END IF;
    IF p_mode='solo_fondo' AND v_lunch THEN RAISE EXCEPTION 'La opción solo fondo no incluye almuerzo.'; END IF;
    v_cyclists:=v_cyclists || jsonb_build_array(
      jsonb_build_object('name',v_name,'lunch',v_lunch,'category',v_category) ||
      CASE WHEN v_fondazo THEN jsonb_build_object('whatsapp',v_guest_phone) ELSE '{}'::jsonb END
    );
    IF v_lunch THEN
      v_lunch_guests:=v_lunch_guests+1;
      v_adults:=v_adults+1;
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

  IF v_invite.lunch_status IN ('comprobante_informado','pago_verificado')
      AND (v_invite.cyclist_guests IS DISTINCT FROM v_cyclists OR
           v_invite.non_cyclist_guests IS DISTINCT FROM v_non_cyclists OR
           v_invite.response IS DISTINCT FROM p_response OR
           v_invite.participation_mode IS DISTINCT FROM p_mode)
  THEN RAISE EXCEPTION 'Ya existe un comprobante o pago registrado. Consultá a administración para modificar la reserva.'; END IF;

  PERFORM public.respond_event_rsvp(p_token, p_response,
    CASE WHEN p_response='voy' THEN p_mode ELSE NULL END,
    CASE WHEN p_response='voy' THEN v_lunch_guests ELSE 0 END
  );
  v_changed := v_invite.cyclist_guests IS DISTINCT FROM v_cyclists
    OR v_invite.non_cyclist_guests IS DISTINCT FROM v_non_cyclists
    OR v_invite.response IS DISTINCT FROM p_response
    OR v_invite.participation_mode IS DISTINCT FROM
      (CASE WHEN p_response='voy' THEN p_mode ELSE NULL END);

  UPDATE public.event_rsvp_invites SET
    recipient_name=v_full_name,
    participant_first_name=v_first,
    participant_last_name=v_last,
    participant_whatsapp=v_phone,
    cyclist_guests=v_cyclists,
    non_cyclist_guests=v_non_cyclists,
    guests_count=CASE WHEN p_response='voy' AND p_mode IN ('fondo_y_almuerzo','solo_almuerzo')
      THEN v_lunch_guests ELSE 0 END,
    lunch_attendees=CASE WHEN p_response='voy' AND p_mode IN ('fondo_y_almuerzo','solo_almuerzo')
      THEN v_attendees ELSE '[]'::jsonb END,
    adults_count=v_adults,
    children_4_9_count=v_children,
    under_4_count=v_under4,
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

-- Compatibilidad con la versión anterior de la PWA: delega toda la validación
-- en la variante con identidad. Los visitantes usan sólo sus datos ya guardados.
CREATE OR REPLACE FUNCTION public.respond_event_rsvp_with_guest_types(
  p_token uuid,
  p_response text,
  p_mode text,
  p_cyclists jsonb,
  p_non_cyclists jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.respond_event_rsvp_with_guest_types(
    p_token,p_response,p_mode,p_cyclists,p_non_cyclists,NULL::jsonb
  );
END $function$;

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
  v_profile public.alumnos%rowtype;
  v_linked boolean := false;
  v_first text;
  v_last text;
  v_full_name text;
  v_whatsapp text;
BEGIN
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = v_invite.event_id
    AND COALESCE(metadata->>'rsvp_enabled', 'false') = 'true';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_prices FROM public.event_rsvp_settings WHERE event_id = v_invite.event_id;

  IF v_invite.alumno_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.alumnos WHERE id=v_invite.alumno_id;
    IF FOUND THEN
      v_linked := true;
      v_first := btrim(coalesce(v_profile.nombre,''));
      v_last := btrim(coalesce(v_profile.apellido,''));
      v_whatsapp := coalesce(v_invite.participant_whatsapp,v_profile.telefono,'');
    END IF;
  END IF;
  IF NOT v_linked THEN
    v_first := btrim(coalesce(v_invite.participant_first_name,''));
    v_last := btrim(coalesce(v_invite.participant_last_name,''));
    v_whatsapp := coalesce(v_invite.participant_whatsapp,'');
  END IF;
  v_full_name := nullif(btrim(v_first || ' ' || v_last),'');
  v_full_name := coalesce(v_full_name,v_invite.recipient_name,'');

  RETURN jsonb_build_object(
    'event', jsonb_build_object('title', v_event.title, 'date', v_event.date, 'location', v_event.location),
    'name', v_full_name,
    'identity', jsonb_build_object(
      'linked',v_linked,
      'first_name',v_first,
      'last_name',v_last,
      'full_name',v_full_name,
      'email',v_invite.recipient_email,
      'whatsapp',v_whatsapp
    ),
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

CREATE OR REPLACE FUNCTION public.create_or_resume_public_rsvp(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_whatsapp text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_verified timestamptz;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text := regexp_replace(btrim(coalesce(p_whatsapp, '')), '[^0-9+]', '', 'g');
  v_alumno_id uuid;
  v_invite public.event_rsvp_invites%ROWTYPE;
  v_profile public.alumnos%ROWTYPE;
  v_token uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingresá con tu email para confirmar la asistencia.';
  END IF;
  SELECT lower(btrim(u.email)),u.email_confirmed_at
    INTO v_email,v_email_verified
  FROM auth.users u WHERE u.id=v_user_id;
  IF v_email IS NULL OR v_email_verified IS NULL THEN
    RAISE EXCEPTION 'Primero verificá tu email para continuar.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.events e
    WHERE e.id=p_event_id AND e.status='publicado'
      AND e.estado_publicacion='publicado'
      AND e.visible_to_students=true AND e.is_active=true
      AND e.metadata->>'rsvp_enabled'='true'
      AND e.metadata->>'event_nature'='propio_informativo'
  ) THEN
    RAISE EXCEPTION 'La confirmación de asistencia no está disponible para este evento.';
  END IF;

  IF char_length(v_first) NOT BETWEEN 2 AND 70 OR char_length(v_last) NOT BETWEEN 2 AND 70 THEN
    RAISE EXCEPTION 'Completá tu nombre y apellido.';
  END IF;
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Ingresá tu WhatsApp con código de país, por ejemplo +54 9 11 1234 5678.';
  END IF;

  -- Jamás asociar una ficha por coincidencia de email: sólo user_id ya validado.
  SELECT a.id INTO v_alumno_id FROM public.alumnos a WHERE a.user_id=v_user_id LIMIT 1;

  SELECT * INTO v_invite FROM public.event_rsvp_invites i
  WHERE i.event_id=p_event_id AND lower(btrim(i.recipient_email))=v_email
    AND i.is_test=false
  ORDER BY i.created_at ASC LIMIT 1 FOR UPDATE;

  v_alumno_id := coalesce(v_invite.alumno_id,v_alumno_id);
  IF v_alumno_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.alumnos WHERE id=v_alumno_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La ficha vinculada no está disponible.'; END IF;
    v_first := btrim(coalesce(v_profile.nombre,''));
    v_last := btrim(coalesce(v_profile.apellido,''));
    IF char_length(v_first) NOT BETWEEN 2 AND 70 OR char_length(v_last) NOT BETWEEN 2 AND 70 THEN
      RAISE EXCEPTION 'La ficha vinculada no tiene nombre y apellido completos.';
    END IF;
  END IF;

  IF v_invite.id IS NOT NULL THEN
    UPDATE public.event_rsvp_invites
      SET recipient_name=v_first || ' ' || v_last,
          participant_first_name=v_first,
          participant_last_name=v_last,
          participant_whatsapp=v_phone,
          alumno_id=v_alumno_id,
          registration_source='public_event',
          updated_at=now()
    WHERE id=v_invite.id;
    RETURN v_invite.token;
  END IF;

  INSERT INTO public.event_rsvp_invites
    (event_id,alumno_id,recipient_email,recipient_name,participant_first_name,participant_last_name,
     participant_whatsapp,is_test,registration_source)
  VALUES
    (p_event_id,v_alumno_id,v_email,v_first || ' ' || v_last,v_first,v_last,v_phone,false,'public_event')
  ON CONFLICT (event_id,recipient_email,is_test)
  DO UPDATE SET
    recipient_name=excluded.recipient_name,
    participant_first_name=excluded.participant_first_name,
    participant_last_name=excluded.participant_last_name,
    participant_whatsapp=excluded.participant_whatsapp,
    alumno_id=coalesce(public.event_rsvp_invites.alumno_id,excluded.alumno_id),
    registration_source='public_event',
    updated_at=now()
  RETURNING token INTO v_token;

  RETURN v_token;
END $function$;

REVOKE ALL ON FUNCTION public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb,jsonb) TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_event_rsvp_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_by_token(uuid) TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_or_resume_public_rsvp(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_or_resume_public_rsvp(uuid,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_or_resume_public_rsvp(uuid,text,text,text) TO authenticated,service_role;

COMMENT ON FUNCTION public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb,jsonb)
IS 'Guarda RSVP con identidad segura: alumno_id manda; visitante exige nombre, apellido y WhatsApp. No busca por email.';