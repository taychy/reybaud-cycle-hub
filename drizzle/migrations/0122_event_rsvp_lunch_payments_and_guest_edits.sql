CREATE TABLE public.event_rsvp_lunch_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.event_rsvp_invites(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  amount_ars numeric(12,2) NOT NULL CHECK (amount_ars > 0),
  bank_reference text NOT NULL,
  covered jsonb NOT NULL,
  expected_for_covered numeric(12,2) NOT NULL,
  comment text NOT NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
CREATE INDEX event_rsvp_lunch_payments_invite_idx ON public.event_rsvp_lunch_payments(invite_id);
CREATE INDEX event_rsvp_lunch_payments_event_idx ON public.event_rsvp_lunch_payments(event_id);

CREATE TABLE public.event_rsvp_guest_edit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.event_rsvp_invites(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  before_guests jsonb NOT NULL,
  after_guests jsonb NOT NULL,
  before_counts jsonb NOT NULL,
  after_counts jsonb NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_rsvp_guest_edit_audit_invite_idx ON public.event_rsvp_guest_edit_audit(invite_id);
CREATE INDEX event_rsvp_guest_edit_audit_event_idx ON public.event_rsvp_guest_edit_audit(event_id);

GRANT SELECT ON public.event_rsvp_lunch_payments TO authenticated;
GRANT SELECT ON public.event_rsvp_guest_edit_audit TO authenticated;
GRANT ALL ON public.event_rsvp_lunch_payments TO service_role;
GRANT ALL ON public.event_rsvp_guest_edit_audit TO service_role;
ALTER TABLE public.event_rsvp_lunch_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvp_guest_edit_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read lunch payments" ON public.event_rsvp_lunch_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read guest edit audit" ON public.event_rsvp_guest_edit_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Clave estable de comensal: rol + nombre normalizado (espejo de src/lib/fondazoLunch.ts).
CREATE OR REPLACE FUNCTION public._rsvp_name_key(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT lower(regexp_replace(translate(btrim(coalesce(p_name,'')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public._rsvp_lunch_diners(p_invite public.event_rsvp_invites)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_array(jsonb_build_object(
      'key', 't:' || public._rsvp_name_key(coalesce(nullif(btrim(coalesce(p_invite.participant_first_name,'') || ' ' || coalesce(p_invite.participant_last_name,'')), ''), p_invite.recipient_name, p_invite.recipient_email)),
      'name', coalesce(nullif(btrim(coalesce(p_invite.participant_first_name,'') || ' ' || coalesce(p_invite.participant_last_name,'')), ''), p_invite.recipient_name, p_invite.recipient_email),
      'category', 'adult', 'role', 'titular'))
    || coalesce((SELECT jsonb_agg(jsonb_build_object('key', 'nc:' || public._rsvp_name_key(g->>'name'), 'name', btrim(g->>'name'), 'category', g->>'category', 'role', 'no_ciclista'))
                 FROM jsonb_array_elements(coalesce(p_invite.non_cyclist_guests,'[]'::jsonb)) g), '[]'::jsonb)
    || coalesce((SELECT jsonb_agg(jsonb_build_object('key', 'cy:' || public._rsvp_name_key(g->>'name'), 'name', btrim(g->>'name'), 'category', 'adult', 'role', 'ciclista'))
                 FROM jsonb_array_elements(coalesce(p_invite.cyclist_guests,'[]'::jsonb)) g WHERE (g->>'lunch')::boolean IS TRUE), '[]'::jsonb)
$$;
REVOKE ALL ON FUNCTION public._rsvp_lunch_diners(public.event_rsvp_invites) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rsvp_name_key(text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public._rsvp_price_of(p_settings public.event_rsvp_settings, p_category text)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE p_category WHEN 'adult' THEN p_settings.adult_price WHEN 'child_4_9' THEN p_settings.child_4_9_price WHEN 'under_4' THEN p_settings.under_4_price END
$$;
REVOKE ALL ON FUNCTION public._rsvp_price_of(public.event_rsvp_settings, text) FROM PUBLIC, anon, authenticated;

-- Corrección administrativa de acompañantes no ciclistas.
CREATE OR REPLACE FUNCTION public.admin_edit_event_rsvp_lunch_guests(p_invite_id uuid, p_non_cyclists jsonb, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v public.event_rsvp_invites%rowtype;
  v_new jsonb := '[]'::jsonb; g jsonb; v_name text; v_cat text;
  v_keys text[] := '{}'; v_key text; v_titular_key text;
  v_cy_lunch int; v_new_adults int; v_new_c int; v_new_u int; v_has_payments boolean;
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

  SELECT EXISTS (SELECT 1 FROM public.event_rsvp_lunch_payments p WHERE p.invite_id = v.id AND p.voided_at IS NULL) INTO v_has_payments;
  IF (v_has_payments OR v.lunch_status = 'comprobante_informado') AND v_before_counts IS DISTINCT FROM v_after_counts THEN
    RAISE EXCEPTION 'Hay un comprobante informado o registrado: cambiar cantidad o categoría de comensales cambia el importe. Anulá el comprobante registrado o volvé el estado con auditoría antes de corregir.'; END IF;

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

-- Registro de comprobante con personas cubiertas; verificación total solo si cuadra.
CREATE OR REPLACE FUNCTION public.admin_register_event_rsvp_lunch_payment(
  p_invite_id uuid, p_amount numeric, p_bank_reference text, p_covered_keys text[], p_comment text, p_mark_verified boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v public.event_rsvp_invites%rowtype; s public.event_rsvp_settings%rowtype;
  v_diners jsonb; v_covered jsonb; v_expected_sel numeric; v_expected_total numeric;
  v_prev_keys text[]; v_all_keys text[]; v_union text[]; v_sum numeric; v_complete boolean; v_new_status text; v_pid uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN RAISE EXCEPTION 'Ingresá el importe del comprobante en ARS.'; END IF;
  IF length(btrim(coalesce(p_bank_reference,''))) < 3 THEN RAISE EXCEPTION 'Ingresá la referencia bancaria del comprobante.'; END IF;
  IF length(btrim(coalesce(p_comment,''))) < 3 THEN RAISE EXCEPTION 'Agregá un comentario de auditoría.'; END IF;
  IF p_covered_keys IS NULL OR cardinality(p_covered_keys) = 0 THEN RAISE EXCEPTION 'Elegí al menos una persona cubierta por este comprobante.'; END IF;
  IF cardinality(p_covered_keys) <> (SELECT count(DISTINCT k) FROM unnest(p_covered_keys) k) THEN RAISE EXCEPTION 'Hay personas repetidas en la selección.'; END IF;

  SELECT * INTO v FROM public.event_rsvp_invites WHERE id = p_invite_id AND NOT is_test FOR UPDATE;
  IF NOT FOUND OR v.response IS DISTINCT FROM 'voy' OR v.participation_mode NOT IN ('fondo_y_almuerzo','solo_almuerzo') THEN
    RAISE EXCEPTION 'La persona no tiene interés vigente en el almuerzo.'; END IF;
  IF v.lunch_status = 'pago_verificado' THEN RAISE EXCEPTION 'El almuerzo ya figura con pago verificado.'; END IF;
  SELECT * INTO s FROM public.event_rsvp_settings WHERE event_id = v.event_id;
  IF NOT FOUND OR s.prices_confirmed_at IS NULL OR s.adult_price IS NULL OR s.child_4_9_price IS NULL OR s.under_4_price IS NULL THEN
    RAISE EXCEPTION 'Confirmá primero las tarifas del restaurante.'; END IF;

  v_diners := public._rsvp_lunch_diners(v);
  SELECT array_agg(d->>'key') INTO v_all_keys FROM jsonb_array_elements(v_diners) d;
  IF EXISTS (SELECT 1 FROM unnest(p_covered_keys) k WHERE NOT k = ANY(v_all_keys)) THEN
    RAISE EXCEPTION 'La selección incluye personas que ya no figuran en la inscripción. Actualizá el panel.'; END IF;
  SELECT coalesce(array_agg(c->>'key'), '{}') INTO v_prev_keys
    FROM public.event_rsvp_lunch_payments p, jsonb_array_elements(p.covered) c WHERE p.invite_id = v.id AND p.voided_at IS NULL;
  IF p_covered_keys && v_prev_keys THEN RAISE EXCEPTION 'Alguna persona elegida ya está cubierta por otro comprobante registrado.'; END IF;

  SELECT jsonb_agg(d), sum(public._rsvp_price_of(s, d->>'category')) INTO v_covered, v_expected_sel
    FROM jsonb_array_elements(v_diners) d WHERE d->>'key' = ANY(p_covered_keys);
  SELECT sum(public._rsvp_price_of(s, d->>'category')) INTO v_expected_total FROM jsonb_array_elements(v_diners) d;
  SELECT coalesce(sum(amount_ars),0) + p_amount INTO v_sum FROM public.event_rsvp_lunch_payments WHERE invite_id = v.id AND voided_at IS NULL;
  v_union := v_prev_keys || p_covered_keys;
  v_complete := (SELECT bool_and(k = ANY(v_union)) FROM unnest(v_all_keys) k) AND v_sum = v_expected_total;

  IF p_mark_verified AND NOT v_complete THEN
    RAISE EXCEPTION 'No se puede verificar: los comprobantes deben cubrir a todos los comensales y sumar exactamente ARS %.', v_expected_total; END IF;

  INSERT INTO public.event_rsvp_lunch_payments(invite_id, event_id, amount_ars, bank_reference, covered, expected_for_covered, comment, actor_user_id)
  VALUES (v.id, v.event_id, p_amount, btrim(p_bank_reference), v_covered, v_expected_sel, btrim(p_comment), v_actor) RETURNING id INTO v_pid;

  v_new_status := CASE WHEN p_mark_verified THEN 'pago_verificado' ELSE 'comprobante_informado' END;
  UPDATE public.event_rsvp_invites SET lunch_status = v_new_status, lunch_admin_comment = btrim(p_comment),
    receipt_reference = btrim(p_bank_reference), lunch_status_changed_at = now(), lunch_status_changed_by = v_actor, updated_at = now()
  WHERE id = v.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment, receipt_reference, actor_user_id)
  VALUES (v.event_id, v.id, v.lunch_status, v_new_status,
    btrim(p_comment) || ' · comprobante ARS ' || p_amount || ' cubre: ' || (SELECT string_agg(c->>'name', '; ') FROM jsonb_array_elements(v_covered) c),
    btrim(p_bank_reference), v_actor);
  RETURN jsonb_build_object('ok', true, 'payment_id', v_pid, 'status', v_new_status, 'complete', v_complete, 'sum', v_sum, 'expected_total', v_expected_total);
END $$;

CREATE OR REPLACE FUNCTION public.admin_void_event_rsvp_lunch_payment(p_payment_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_actor uuid := auth.uid(); p public.event_rsvp_lunch_payments%rowtype; v_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF length(btrim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'Indicá el motivo de la anulación.'; END IF;
  SELECT * INTO p FROM public.event_rsvp_lunch_payments WHERE id = p_payment_id AND voided_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprobante no encontrado o ya anulado.'; END IF;
  SELECT lunch_status INTO v_status FROM public.event_rsvp_invites WHERE id = p.invite_id FOR UPDATE;
  IF v_status = 'pago_verificado' THEN RAISE EXCEPTION 'El pago está verificado. Volvé el estado con auditoría antes de anular un comprobante.'; END IF;
  UPDATE public.event_rsvp_lunch_payments SET voided_at = now(), voided_by = v_actor, void_reason = btrim(p_reason) WHERE id = p.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment, receipt_reference, actor_user_id)
  VALUES (p.event_id, p.invite_id, v_status, v_status, 'Comprobante anulado: ' || btrim(p_reason), p.bank_reference, v_actor);
END $$;

CREATE OR REPLACE FUNCTION public.get_event_rsvp_lunch_payments_admin(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_actor uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(p) - 'actor_user_id' - 'voided_by' ORDER BY p.created_at), '[]'::jsonb) INTO v_result
  FROM public.event_rsvp_lunch_payments p JOIN public.event_rsvp_invites i ON i.id = p.invite_id
  WHERE p.event_id = p_event_id AND NOT i.is_test;
  RETURN v_result;
END $$;

-- "Pago verificado" pasa a requerir el registro de comprobante con cobertura completa.
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
    RAISE EXCEPTION 'Para verificar el pago usá «Registrar comprobante»: hay que indicar importe, referencia y personas cubiertas.';
  END IF;
  IF BTRIM(COALESCE(p_comment, '')) = '' THEN RAISE EXCEPTION 'Agregá un comentario de auditoría.'; END IF;
  SELECT * INTO v_invite FROM public.event_rsvp_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR v_invite.response <> 'voy' OR v_invite.participation_mode NOT IN ('fondo_y_almuerzo', 'solo_almuerzo') THEN
    RAISE EXCEPTION 'La persona no tiene interés vigente en el almuerzo.';
  END IF;
  UPDATE public.event_rsvp_invites SET lunch_status = p_status,
    lunch_admin_comment = BTRIM(p_comment), receipt_reference = COALESCE(NULLIF(BTRIM(p_receipt_reference), ''), v_invite.receipt_reference),
    lunch_status_changed_at = now(), lunch_status_changed_by = v_actor, updated_at = now()
  WHERE id = v_invite.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment, receipt_reference, actor_user_id)
  VALUES (v_invite.event_id, v_invite.id, v_invite.lunch_status, p_status,
    BTRIM(p_comment), NULLIF(BTRIM(p_receipt_reference), ''), v_actor);
END $function$;

REVOKE ALL ON FUNCTION public.admin_edit_event_rsvp_lunch_guests(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_register_event_rsvp_lunch_payment(uuid, numeric, text, text[], text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_void_event_rsvp_lunch_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_rsvp_lunch_payments_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_event_rsvp_lunch_guests(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_event_rsvp_lunch_payment(uuid, numeric, text, text[], text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_void_event_rsvp_lunch_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_lunch_payments_admin(uuid) TO authenticated;