CREATE OR REPLACE FUNCTION public.admin_verify_event_rsvp_lunch_payments(p_invite_id uuid, p_comment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v public.event_rsvp_invites%rowtype; s public.event_rsvp_settings%rowtype;
  v_diners jsonb; v_all_keys text[]; v_keys text[]; v_sum numeric; v_expected numeric; v_count int;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF length(btrim(coalesce(p_comment,''))) < 3 THEN RAISE EXCEPTION 'Agregá un comentario de auditoría.'; END IF;
  SELECT * INTO v FROM public.event_rsvp_invites WHERE id = p_invite_id AND NOT is_test FOR UPDATE;
  IF NOT FOUND OR v.response IS DISTINCT FROM 'voy' OR v.participation_mode NOT IN ('fondo_y_almuerzo','solo_almuerzo') THEN
    RAISE EXCEPTION 'La persona no tiene interés vigente en el almuerzo.'; END IF;
  IF v.lunch_status <> 'comprobante_informado' THEN RAISE EXCEPTION 'Solo se verifican comprobantes en estado «Comprobante recibido».'; END IF;
  SELECT * INTO s FROM public.event_rsvp_settings WHERE event_id = v.event_id;
  IF NOT FOUND OR s.prices_confirmed_at IS NULL OR s.adult_price IS NULL OR s.child_4_9_price IS NULL OR s.under_4_price IS NULL THEN
    RAISE EXCEPTION 'Confirmá primero las tarifas del restaurante.'; END IF;
  PERFORM 1 FROM public.event_rsvp_lunch_payments WHERE invite_id = v.id AND voided_at IS NULL FOR UPDATE;
  SELECT count(*), coalesce(sum(amount_ars),0) INTO v_count, v_sum FROM public.event_rsvp_lunch_payments WHERE invite_id = v.id AND voided_at IS NULL;
  IF v_count = 0 THEN RAISE EXCEPTION 'No hay comprobantes registrados vigentes.'; END IF;
  IF EXISTS (SELECT 1 FROM public.event_rsvp_lunch_payments WHERE invite_id = v.id AND voided_at IS NULL AND (amount_ars <= 0 OR length(btrim(coalesce(bank_reference,''))) < 3)) THEN
    RAISE EXCEPTION 'Hay comprobantes sin importe o sin referencia bancaria.'; END IF;
  SELECT coalesce(array_agg(c->>'key'), '{}') INTO v_keys
    FROM public.event_rsvp_lunch_payments p, jsonb_array_elements(p.covered) c WHERE p.invite_id = v.id AND p.voided_at IS NULL;
  IF cardinality(v_keys) <> (SELECT count(DISTINCT k) FROM unnest(v_keys) k) THEN RAISE EXCEPTION 'Una persona figura cubierta por más de un comprobante.'; END IF;
  v_diners := public._rsvp_lunch_diners(v);
  SELECT array_agg(d->>'key'), sum(public._rsvp_price_of(s, d->>'category')) INTO v_all_keys, v_expected FROM jsonb_array_elements(v_diners) d;
  IF EXISTS (SELECT 1 FROM unnest(v_keys) k WHERE NOT k = ANY(v_all_keys)) THEN
    RAISE EXCEPTION 'Un comprobante cubre a personas que ya no figuran en la inscripción. Anulalo y registralo de nuevo.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_all_keys) k WHERE NOT k = ANY(v_keys)) THEN
    RAISE EXCEPTION 'Faltan comensales sin cubrir por comprobantes.'; END IF;
  IF v_sum <> v_expected THEN RAISE EXCEPTION 'Los comprobantes suman ARS % y la tarifa confirmada es ARS %.', v_sum, v_expected; END IF;

  UPDATE public.event_rsvp_invites SET lunch_status = 'pago_verificado', lunch_admin_comment = btrim(p_comment),
    lunch_status_changed_at = now(), lunch_status_changed_by = v_actor, updated_at = now() WHERE id = v.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment, receipt_reference, actor_user_id)
  VALUES (v.event_id, v.id, v.lunch_status, 'pago_verificado',
    btrim(p_comment) || ' · verificación de ' || v_count || ' comprobante(s) por ARS ' || v_sum, v.receipt_reference, v_actor);
  RETURN jsonb_build_object('ok', true, 'sum', v_sum, 'expected_total', v_expected);
END $$;
REVOKE ALL ON FUNCTION public.admin_verify_event_rsvp_lunch_payments(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_event_rsvp_lunch_payments(uuid, text) TO authenticated;

-- Con comprobantes vigentes no se editan acompañantes (las claves de cobertura dependen del nombre).
CREATE OR REPLACE FUNCTION public._rsvp_guard_guest_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RETURN NEW;
END $$;
DROP FUNCTION public._rsvp_guard_guest_edit();

CREATE OR REPLACE FUNCTION public.admin_edit_event_rsvp_lunch_guests(p_invite_id uuid, p_non_cyclists jsonb, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v public.event_rsvp_invites%rowtype;
  v_new jsonb := '[]'::jsonb; g jsonb; v_name text; v_cat text;
  v_keys text[] := '{}'; v_key text; v_titular_key text;
  v_cy_lunch int; v_new_adults int; v_new_c int; v_new_u int;
  v_before_counts jsonb; v_after_counts jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF length(btrim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'Indicá el motivo de la corrección.'; END IF;
  IF p_non_cyclists IS NULL OR jsonb_typeof(p_non_cyclists) <> 'array' OR jsonb_array_length(p_non_cyclists) > 50 THEN RAISE EXCEPTION 'Lista de acompañantes inválida.'; END IF;
  SELECT * INTO v FROM public.event_rsvp_invites WHERE id = p_invite_id AND NOT is_test FOR UPDATE;
  IF NOT FOUND OR v.response IS DISTINCT FROM 'voy' OR v.participation_mode NOT IN ('fondo_y_almuerzo','solo_almuerzo') THEN
    RAISE EXCEPTION 'La persona no tiene interés vigente en el almuerzo.'; END IF;
  IF v.lunch_status = 'pago_verificado' THEN
    RAISE EXCEPTION 'El pago ya está verificado. Volvé el estado a «Comprobante recibido» con auditoría antes de corregir comensales.'; END IF;
  IF EXISTS (SELECT 1 FROM public.event_rsvp_lunch_payments p WHERE p.invite_id = v.id AND p.voided_at IS NULL) THEN
    RAISE EXCEPTION 'Hay comprobantes registrados vigentes: anulalos antes de corregir acompañantes y volvé a registrarlos después.'; END IF;

  v_titular_key := (public._rsvp_lunch_diners(v) -> 0 ->> 'key');
  v_keys := ARRAY[substr(v_titular_key, 3)];
  SELECT coalesce(array_agg(public._rsvp_name_key(c->>'name')), '{}') || v_keys INTO v_keys FROM jsonb_array_elements(coalesce(v.cyclist_guests,'[]'::jsonb)) c;

  FOR g IN SELECT * FROM jsonb_array_elements(p_non_cyclists) LOOP
    v_name := regexp_replace(btrim(coalesce(g->>'name','')), '\s+', ' ', 'g');
    v_cat := g->>'category';
    IF length(v_name) < 2 OR length(v_name) > 100 THEN RAISE EXCEPTION 'Cada acompañante necesita nombre (2 a 100 caracteres).'; END IF;
    IF v_cat IS NULL OR v_cat NOT IN ('adult','child_4_9','under_4') THEN RAISE EXCEPTION 'Categoría inválida para %.', v_name; END IF;
    v_key := public._rsvp_name_key(v_name);
    IF v_key = ANY(v_keys) THEN RAISE EXCEPTION 'Nombre duplicado: % ya figura en esta inscripción.', v_name; END IF;
    v_keys := v_keys || v_key;
    v_new := v_new || jsonb_build_array(jsonb_build_object('name', v_name, 'category', v_cat));
  END LOOP;

  SELECT count(*) INTO v_cy_lunch FROM jsonb_array_elements(coalesce(v.cyclist_guests,'[]'::jsonb)) c WHERE (c->>'lunch')::boolean IS TRUE;
  SELECT 1 + v_cy_lunch + count(*) FILTER (WHERE x->>'category'='adult'),
         count(*) FILTER (WHERE x->>'category'='child_4_9'), count(*) FILTER (WHERE x->>'category'='under_4')
    INTO v_new_adults, v_new_c, v_new_u FROM jsonb_array_elements(v_new) x;
  v_before_counts := jsonb_build_object('guests_count', v.guests_count, 'adults', v.adults_count, 'children_4_9', v.children_4_9_count, 'under_4', v.under_4_count);
  v_after_counts := jsonb_build_object('guests_count', jsonb_array_length(v_new) + v_cy_lunch, 'adults', v_new_adults, 'children_4_9', v_new_c, 'under_4', v_new_u);
  IF coalesce(v.non_cyclist_guests,'[]'::jsonb) = v_new THEN RETURN jsonb_build_object('ok', true, 'changed', false); END IF;

  IF v.lunch_status = 'comprobante_informado' AND v_before_counts IS DISTINCT FROM v_after_counts THEN
    RAISE EXCEPTION 'El participante informó un comprobante: cambiar cantidad o categoría cambia el importe. Volvé el estado con auditoría antes de corregir.'; END IF;

  UPDATE public.event_rsvp_invites SET
    non_cyclist_guests = v_new,
    lunch_attendees = coalesce((SELECT jsonb_agg(jsonb_build_object('name', x->>'name', 'category', x->>'category', 'is_cyclist', false)) FROM jsonb_array_elements(v_new) x), '[]'::jsonb)
      || coalesce((SELECT jsonb_agg(a) FROM jsonb_array_elements(coalesce(v.lunch_attendees,'[]'::jsonb)) a WHERE (a->>'is_cyclist')::boolean IS TRUE), '[]'::jsonb),
    guests_count = jsonb_array_length(v_new) + v_cy_lunch,
    adults_count = v_new_adults, children_4_9_count = v_new_c, under_4_count = v_new_u,
    updated_at = now()
  WHERE id = v.id;

  INSERT INTO public.event_rsvp_guest_edit_audit(invite_id, event_id, before_guests, after_guests, before_counts, after_counts, reason, actor_user_id)
  VALUES (v.id, v.event_id, coalesce(v.non_cyclist_guests,'[]'::jsonb), v_new, v_before_counts, v_after_counts, btrim(p_reason), v_actor);
  RETURN jsonb_build_object('ok', true, 'changed', true, 'counts', v_after_counts);
END $$;

-- Con comprobantes vigentes el estado queda en «Comprobante recibido» (o se verifica por su RPC).
CREATE OR REPLACE FUNCTION public.admin_set_event_rsvp_lunch_status(p_invite_id uuid, p_status text, p_comment text, p_receipt_reference text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_invite public.event_rsvp_invites%rowtype;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF p_status NOT IN ('intencion_confirmada', 'instrucciones_pendientes', 'instrucciones_enviadas', 'comprobante_informado', 'pago_verificado') THEN
    RAISE EXCEPTION 'Estado inválido.';
  END IF;
  IF p_status = 'pago_verificado' THEN
    RAISE EXCEPTION 'Para verificar el pago usá «Registrar comprobante» o «Verificar pagos registrados».';
  END IF;
  IF BTRIM(COALESCE(p_comment, '')) = '' THEN RAISE EXCEPTION 'Agregá un comentario de auditoría.'; END IF;
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR v_invite.response <> 'voy' OR v_invite.participation_mode NOT IN ('fondo_y_almuerzo', 'solo_almuerzo') THEN
    RAISE EXCEPTION 'La persona no tiene interés vigente en el almuerzo.';
  END IF;
  IF p_status <> 'comprobante_informado' AND EXISTS (
    SELECT 1 FROM public.event_rsvp_lunch_payments p WHERE p.invite_id = v_invite.id AND p.voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay comprobantes registrados vigentes: el estado debe quedar en «Comprobante recibido». Anulalos antes de volver a un estado anterior.';
  END IF;
  UPDATE public.event_rsvp_invites SET lunch_status = p_status,
    lunch_admin_comment = BTRIM(p_comment), receipt_reference = COALESCE(NULLIF(BTRIM(p_receipt_reference), ''), v_invite.receipt_reference),
    lunch_status_changed_at = now(), lunch_status_changed_by = v_actor, updated_at = now()
  WHERE id = v_invite.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment, receipt_reference, actor_user_id)
  VALUES (v_invite.event_id, v_invite.id, v_invite.lunch_status, p_status,
    BTRIM(p_comment), NULLIF(BTRIM(p_receipt_reference), ''), v_actor);
END $function$;