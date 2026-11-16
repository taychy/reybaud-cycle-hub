-- Fondazo: encuesta preliminar y gestión administrativa del almuerzo.
-- Migración estrictamente aditiva: no modifica events, reservas, pagos ni datos existentes.
-- PENDIENTE DE APLICACIÓN AUTORIZADA en la base compartida.

CREATE TABLE public.event_rsvp_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_test boolean NOT NULL DEFAULT false,
  response text CHECK (response IN ('voy', 'no_voy')),
  participation_mode text CHECK (participation_mode IN ('fondo_y_almuerzo', 'solo_fondo', 'solo_almuerzo')),
  guests_count integer NOT NULL DEFAULT 0 CHECK (guests_count BETWEEN 0 AND 30),
  responded_at timestamptz,
  last_sent_at timestamptz,
  lunch_status text NOT NULL DEFAULT 'sin_interes' CHECK (lunch_status IN ('sin_interes', 'intencion_confirmada', 'instrucciones_pendientes', 'instrucciones_enviadas', 'comprobante_informado', 'pago_verificado')),
  adults_count integer NOT NULL DEFAULT 1 CHECK (adults_count BETWEEN 0 AND 30),
  children_4_9_count integer NOT NULL DEFAULT 0 CHECK (children_4_9_count BETWEEN 0 AND 30),
  under_4_count integer NOT NULL DEFAULT 0 CHECK (under_4_count BETWEEN 0 AND 30),
  lunch_confirmed_at timestamptz,
  terms_version text,
  terms_accepted_at timestamptz,
  terms_text_snapshot text,
  receipt_reference text,
  lunch_admin_comment text,
  lunch_status_changed_at timestamptz,
  lunch_status_changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_rsvp_invites_unique_email_kind UNIQUE (event_id, recipient_email, is_test),
  CONSTRAINT event_rsvp_mode_requires_yes CHECK (response = 'voy' OR participation_mode IS NULL),
  CONSTRAINT event_rsvp_guests_require_yes CHECK (response = 'voy' OR guests_count = 0),
  CONSTRAINT event_rsvp_lunch_guest_limit CHECK (adults_count + children_4_9_count + under_4_count <= 31)
);
GRANT ALL ON public.event_rsvp_invites TO service_role;
ALTER TABLE public.event_rsvp_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_rsvp_invites FROM anon, authenticated;
CREATE INDEX idx_event_rsvp_invites_event ON public.event_rsvp_invites(event_id, is_test);
CREATE INDEX idx_event_rsvp_invites_alumno ON public.event_rsvp_invites(alumno_id);
COMMENT ON TABLE public.event_rsvp_invites IS 'Intención de asistencia y almuerzo directo al restaurante. No es reserva ni cobro de Reybaud; acceso sólo por función validada.';

CREATE TABLE public.event_rsvp_settings (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  adult_price numeric(12,2) CHECK (adult_price >= 0),
  child_4_9_price numeric(12,2) CHECK (child_4_9_price >= 0),
  under_4_price numeric(12,2) CHECK (under_4_price >= 0),
  prices_confirmed_at timestamptz,
  prices_confirmed_by uuid,
  prices_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_rsvp_prices_complete CHECK (
    prices_confirmed_at IS NULL OR
    (adult_price IS NOT NULL AND child_4_9_price IS NOT NULL AND under_4_price IS NOT NULL)
  )
);
GRANT ALL ON public.event_rsvp_settings TO service_role;
ALTER TABLE public.event_rsvp_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_rsvp_settings FROM anon, authenticated;
COMMENT ON TABLE public.event_rsvp_settings IS 'Tarifas del restaurante confirmadas manualmente; nunca importes históricos supuestos.';

CREATE TABLE public.event_rsvp_lunch_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL REFERENCES public.event_rsvp_invites(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  comment text NOT NULL,
  receipt_reference text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.event_rsvp_lunch_audit TO service_role;
ALTER TABLE public.event_rsvp_lunch_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_rsvp_lunch_audit FROM anon, authenticated;
CREATE INDEX idx_event_rsvp_lunch_audit_invite ON public.event_rsvp_lunch_audit(invite_id, created_at DESC);
COMMENT ON TABLE public.event_rsvp_lunch_audit IS 'Historial append-only administrativo y de aceptación; sin tokens ni comprobantes sensibles.';

CREATE OR REPLACE FUNCTION public.get_event_rsvp_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.get_event_rsvp_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_by_token(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.respond_event_rsvp(
  p_token uuid, p_response text, p_participation_mode text DEFAULT NULL, p_guests_count integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.respond_event_rsvp(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_event_rsvp(uuid, text, text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_event_rsvp_lunch(
  p_token uuid, p_adults integer, p_children_4_9 integer, p_under_4 integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.confirm_event_rsvp_lunch(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_event_rsvp_lunch(uuid, integer, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_event_rsvp_prices(
  p_event_id uuid, p_adult numeric, p_child_4_9 numeric, p_under_4 numeric, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_role text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN RAISE EXCEPTION 'No autorizado.'; END IF;
  IF p_adult IS NULL OR p_child_4_9 IS NULL OR p_under_4 IS NULL
    OR p_adult < 0 OR p_child_4_9 < 0 OR p_under_4 < 0
    OR p_adult > 10000000 OR p_child_4_9 > 10000000 OR p_under_4 > 10000000 THEN
    RAISE EXCEPTION 'Confirmá valores válidos para las tres categorías.';
  END IF;
  INSERT INTO public.event_rsvp_settings (event_id, adult_price, child_4_9_price, under_4_price,
    prices_confirmed_at, prices_confirmed_by, prices_note, updated_at)
  VALUES (p_event_id, p_adult, p_child_4_9, p_under_4, now(), v_actor, NULLIF(BTRIM(p_note), ''), now())
  ON CONFLICT (event_id) DO UPDATE SET adult_price = excluded.adult_price,
    child_4_9_price = excluded.child_4_9_price, under_4_price = excluded.under_4_price,
    prices_confirmed_at = excluded.prices_confirmed_at, prices_confirmed_by = excluded.prices_confirmed_by,
    prices_note = excluded.prices_note, updated_at = now();
  v_role := CASE WHEN public.is_super_admin(v_actor) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (v_actor, (SELECT email FROM auth.users WHERE id = v_actor), v_role,
    'event_rsvp_prices_confirmed', 'event', p_event_id::text,
    jsonb_build_object('adult_price', p_adult, 'child_4_9_price', p_child_4_9,
      'under_4_price', p_under_4, 'note', NULLIF(BTRIM(p_note), '')));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_event_rsvp_prices(uuid, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_event_rsvp_prices(uuid, numeric, numeric, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_event_rsvp_lunch_status(
  p_invite_id uuid, p_status text, p_comment text, p_receipt_reference text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
  IF p_status = 'pago_verificado' AND (v_invite.terms_accepted_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.event_rsvp_settings s WHERE s.event_id = v_invite.event_id AND s.prices_confirmed_at IS NOT NULL
  )) THEN RAISE EXCEPTION 'La reserva verificada requiere condiciones aceptadas y tarifas confirmadas.'; END IF;
  UPDATE public.event_rsvp_invites SET lunch_status = p_status,
    lunch_admin_comment = BTRIM(p_comment), receipt_reference = NULLIF(BTRIM(p_receipt_reference), ''),
    lunch_status_changed_at = now(), lunch_status_changed_by = v_actor, updated_at = now()
  WHERE id = v_invite.id;
  INSERT INTO public.event_rsvp_lunch_audit (event_id, invite_id, from_status, to_status, comment, receipt_reference, actor_user_id)
  VALUES (v_invite.event_id, v_invite.id, v_invite.lunch_status, p_status,
    BTRIM(p_comment), NULLIF(BTRIM(p_receipt_reference), ''), v_actor);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_event_rsvp_lunch_status(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_event_rsvp_lunch_status(uuid, text, text, text) TO authenticated, service_role;
