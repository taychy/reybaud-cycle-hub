-- Noches extra: modalidad (addon) por participante + habitación compartida separada del rooming principal.
CREATE TABLE public.extra_night_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  partner_reservation_id uuid REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES public.event_addons(id) ON DELETE RESTRICT,
  noche_timing text NOT NULL CHECK (noche_timing IN ('antes','despues','ambas')),
  estado text NOT NULL CHECK (estado IN ('pendiente_companero','pendiente_aceptacion','confirmada','rechazada','cancelada')),
  origen text NOT NULL DEFAULT 'admin' CHECK (origen IN ('admin','participante')),
  requested_by uuid,
  resolved_by uuid,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (partner_reservation_id IS NULL OR partner_reservation_id <> reservation_id)
);
GRANT SELECT ON public.extra_night_pairings TO authenticated;
GRANT ALL ON public.extra_night_pairings TO service_role;
ALTER TABLE public.extra_night_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extra_night_pairings admin select" ON public.extra_night_pairings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE INDEX idx_enp_event ON public.extra_night_pairings(event_id);
CREATE INDEX idx_enp_res ON public.extra_night_pairings(reservation_id);
CREATE INDEX idx_enp_partner ON public.extra_night_pairings(partner_reservation_id);

CREATE TABLE public.extra_night_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  partner_reservation_id uuid,
  pairing_id uuid,
  accion text NOT NULL,
  addon_anterior_id uuid,
  addon_nuevo_id uuid,
  timing_anterior text,
  timing_nuevo text,
  subtotal_anterior numeric,
  subtotal_nuevo numeric,
  origen text NOT NULL,
  actor_user_id uuid,
  actor_email text,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.extra_night_changes TO authenticated;
GRANT ALL ON public.extra_night_changes TO service_role;
ALTER TABLE public.extra_night_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extra_night_changes admin select" ON public.extra_night_changes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE INDEX idx_enc_res ON public.extra_night_changes(reservation_id);
CREATE INDEX idx_enc_event ON public.extra_night_changes(event_id);

-- Una persona no puede estar en dos habitaciones de noche extra activas.
CREATE OR REPLACE FUNCTION public.trg_extra_night_pairing_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.estado = 'confirmada' THEN
    IF NEW.partner_reservation_id IS NULL THEN RAISE EXCEPTION 'pairing_confirmada_sin_companero'; END IF;
    IF EXISTS (SELECT 1 FROM extra_night_pairings p WHERE p.id <> NEW.id AND p.estado = 'confirmada'
      AND (p.reservation_id IN (NEW.reservation_id, NEW.partner_reservation_id)
        OR p.partner_reservation_id IN (NEW.reservation_id, NEW.partner_reservation_id))) THEN
      RAISE EXCEPTION 'participante_ya_asignado_noche_extra';
    END IF;
  ELSIF NEW.estado IN ('pendiente_companero','pendiente_aceptacion') THEN
    IF EXISTS (SELECT 1 FROM extra_night_pairings p WHERE p.id <> NEW.id
      AND ((p.reservation_id = NEW.reservation_id AND p.estado IN ('pendiente_companero','pendiente_aceptacion','confirmada'))
        OR (p.partner_reservation_id = NEW.reservation_id AND p.estado = 'confirmada'))) THEN
      RAISE EXCEPTION 'participante_ya_asignado_noche_extra';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_extra_night_pairing_guard BEFORE INSERT OR UPDATE ON public.extra_night_pairings
  FOR EACH ROW EXECUTE FUNCTION public.trg_extra_night_pairing_guard();

-- Helpers
CREATE OR REPLACE FUNCTION public._extra_night_is_night(p_nombre text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p_nombre,'') ~* 'noche[s]?\s+extra' $$;
CREATE OR REPLACE FUNCTION public._extra_night_is_shared(p_nombre text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p_nombre,'') ~* '(doble|compartid|twin|double)' $$;

CREATE OR REPLACE FUNCTION public._extra_night_res_name(p_res uuid, p_short boolean DEFAULT false)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_short
    THEN trim(split_part(COALESCE(a.nombre, x.nombre, ''),' ',1) || ' ' || left(COALESCE(a.apellido, x.apellido, ''),1) || CASE WHEN COALESCE(a.apellido, x.apellido,'') <> '' THEN '.' ELSE '' END)
    ELSE trim(COALESCE(a.nombre, x.nombre, '') || ' ' || COALESCE(a.apellido, x.apellido, '')) END
  FROM event_reservations er
  LEFT JOIN alumnos a ON a.id = er.alumno_id
  LEFT JOIN event_external_participants x ON x.id = er.external_participant_id
  WHERE er.id = p_res
$$;

CREATE OR REPLACE FUNCTION public._extra_night_eligible(p_res uuid, p_event uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM event_reservations er WHERE er.id = p_res AND er.event_id = p_event
    AND er.cancelled_at IS NULL AND er.reservation_status NOT IN ('cancelada','rechazada'))
$$;

-- Estado actual de la noche extra de una reserva
CREATE OR REPLACE FUNCTION public._extra_night_current(p_res uuid)
RETURNS TABLE(addon_id uuid, nombre text, noche_timing text, subtotal numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ra.addon_id, ea.nombre, ra.noche_timing, ra.subtotal
  FROM reservation_addons ra JOIN event_addons ea ON ea.id = ra.addon_id
  WHERE ra.reservation_id = p_res AND public._extra_night_is_night(ea.nombre)
  ORDER BY ra.created_at LIMIT 1
$$;

-- Aplica modalidad (addon) y momento a una reserva. Reusa reservation_addons y su recálculo.
CREATE OR REPLACE FUNCTION public._extra_night_apply(p_res uuid, p_addon uuid, p_timing text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event uuid; v_addon record; v_qty int;
BEGIN
  SELECT event_id INTO v_event FROM event_reservations WHERE id = p_res;
  DELETE FROM reservation_addons ra USING event_addons ea
   WHERE ra.reservation_id = p_res AND ea.id = ra.addon_id AND public._extra_night_is_night(ea.nombre)
     AND (p_addon IS NULL OR ra.addon_id <> p_addon);
  IF p_addon IS NULL THEN RETURN; END IF;
  SELECT * INTO v_addon FROM event_addons WHERE id = p_addon AND event_id = v_event AND activo;
  IF NOT FOUND OR NOT public._extra_night_is_night(v_addon.nombre) THEN RAISE EXCEPTION 'addon_noche_extra_invalido'; END IF;
  IF p_timing IS NULL OR p_timing NOT IN ('antes','despues','ambas') THEN RAISE EXCEPTION 'momento_noche_extra_invalido'; END IF;
  v_qty := CASE WHEN p_timing = 'ambas' THEN 2 ELSE 1 END;
  INSERT INTO reservation_addons (reservation_id, addon_id, cantidad, precio_unitario, currency, noche_timing, added_by)
  VALUES (p_res, p_addon, v_qty, v_addon.precio, v_addon.currency, p_timing, auth.uid())
  ON CONFLICT (reservation_id, addon_id) DO UPDATE
    SET cantidad = EXCLUDED.cantidad, noche_timing = EXCLUDED.noche_timing,
        precio_unitario = CASE WHEN reservation_addons.noche_timing IS DISTINCT FROM EXCLUDED.noche_timing
                                 OR reservation_addons.cantidad <> EXCLUDED.cantidad
                               THEN EXCLUDED.precio_unitario ELSE reservation_addons.precio_unitario END;
END $$;

-- Vista previa del impacto económico (sin escribir)
CREATE OR REPLACE FUNCTION public._extra_night_preview_row(p_res uuid, p_addon uuid, p_timing text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; er record; v_addon record; v_new numeric := 0; v_old numeric := 0; v_total_new numeric; v_paid numeric;
BEGIN
  SELECT * INTO er FROM event_reservations WHERE id = p_res;
  SELECT * INTO c FROM public._extra_night_current(p_res);
  v_old := COALESCE(c.subtotal, 0);
  IF p_addon IS NOT NULL THEN
    SELECT * INTO v_addon FROM event_addons WHERE id = p_addon;
    v_new := COALESCE(v_addon.precio,0) * (CASE WHEN p_timing = 'ambas' THEN 2 ELSE 1 END);
    IF c.addon_id = p_addon AND c.noche_timing IS NOT DISTINCT FROM p_timing THEN v_new := v_old; END IF;
  END IF;
  v_paid := COALESCE(er.amount_paid,0);
  v_total_new := COALESCE(er.amount_total,0) - v_old + v_new;
  RETURN jsonb_build_object(
    'reservation_id', p_res, 'nombre', public._extra_night_res_name(p_res),
    'antes', jsonb_build_object('addon_id', c.addon_id, 'nombre', c.nombre, 'timing', c.noche_timing, 'subtotal', v_old),
    'despues', jsonb_build_object('addon_id', p_addon, 'nombre', v_addon.nombre, 'timing', p_timing, 'subtotal', v_new),
    'diferencia', v_new - v_old,
    'currency', COALESCE(v_addon.currency, 'ARS'),
    'total_actual', er.amount_total, 'total_nuevo', v_total_new,
    'pagado', v_paid, 'saldo_actual', er.balance_due,
    'saldo_nuevo', GREATEST(v_total_new - v_paid, 0),
    'saldo_a_favor', GREATEST(v_paid - v_total_new, 0));
END $$;

CREATE OR REPLACE FUNCTION public._extra_night_log(p_event uuid, p_res uuid, p_partner uuid, p_pairing uuid, p_accion text,
  p_before jsonb, p_addon uuid, p_timing text, p_origen text, p_nota text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public._extra_night_current(p_res);
  INSERT INTO extra_night_changes(event_id, reservation_id, partner_reservation_id, pairing_id, accion,
    addon_anterior_id, addon_nuevo_id, timing_anterior, timing_nuevo, subtotal_anterior, subtotal_nuevo,
    origen, actor_user_id, actor_email, nota)
  VALUES (p_event, p_res, p_partner, p_pairing, p_accion,
    NULLIF(p_before->>'addon_id','')::uuid, c.addon_id, p_before->>'timing', c.noche_timing,
    NULLIF(p_before->>'subtotal','')::numeric, COALESCE(c.subtotal,0),
    p_origen, auth.uid(), auth.email(), p_nota);
END $$;

-- Consolida una habitación compartida confirmada (ambos con la misma modalidad y momento)
CREATE OR REPLACE FUNCTION public._extra_night_confirm_pair(p_event uuid, p_res uuid, p_partner uuid, p_addon uuid,
  p_timing text, p_origen text, p_nota text, p_pairing uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b1 jsonb; b2 jsonb; v_id uuid := p_pairing; v_nombre text;
BEGIN
  SELECT nombre INTO v_nombre FROM event_addons WHERE id = p_addon AND event_id = p_event;
  IF NOT public._extra_night_is_shared(v_nombre) THEN RAISE EXCEPTION 'modalidad_no_compartida'; END IF;
  IF NOT public._extra_night_eligible(p_res, p_event) OR NOT public._extra_night_eligible(p_partner, p_event) THEN
    RAISE EXCEPTION 'participante_no_elegible';
  END IF;
  -- cerrar asignaciones activas previas de ambos
  UPDATE extra_night_pairings SET estado = 'cancelada', resolved_at = now(), resolved_by = auth.uid()
   WHERE (v_id IS NULL OR id <> v_id) AND estado IN ('pendiente_companero','pendiente_aceptacion','confirmada')
     AND (reservation_id IN (p_res, p_partner) OR partner_reservation_id IN (p_res, p_partner));
  b1 := (SELECT to_jsonb(c) FROM public._extra_night_current(p_res) c);
  b2 := (SELECT to_jsonb(c) FROM public._extra_night_current(p_partner) c);
  PERFORM public._extra_night_apply(p_res, p_addon, p_timing);
  PERFORM public._extra_night_apply(p_partner, p_addon, p_timing);
  IF v_id IS NULL THEN
    INSERT INTO extra_night_pairings(event_id, reservation_id, partner_reservation_id, addon_id, noche_timing, estado, origen, requested_by, resolved_by, resolved_at, nota)
    VALUES (p_event, p_res, p_partner, p_addon, p_timing, 'confirmada', p_origen, auth.uid(), auth.uid(), now(), p_nota)
    RETURNING id INTO v_id;
  ELSE
    UPDATE extra_night_pairings SET estado = 'confirmada', addon_id = p_addon, noche_timing = p_timing,
      resolved_at = now(), resolved_by = auth.uid() WHERE id = v_id;
  END IF;
  PERFORM public._extra_night_log(p_event, p_res, p_partner, v_id, 'compartida_confirmada', COALESCE(b1,'{}'), p_addon, p_timing, p_origen, p_nota);
  PERFORM public._extra_night_log(p_event, p_partner, p_res, v_id, 'compartida_confirmada', COALESCE(b2,'{}'), p_addon, p_timing, p_origen, p_nota);
  RETURN v_id;
END $$;

-- ADMIN: vista previa
CREATE OR REPLACE FUNCTION public.admin_extra_night_preview(p_reservation_id uuid, p_addon_id uuid, p_timing text, p_partner_reservation_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_rows := v_rows || jsonb_build_array(public._extra_night_preview_row(p_reservation_id, p_addon_id, p_timing));
  IF p_partner_reservation_id IS NOT NULL THEN
    v_rows := v_rows || jsonb_build_array(public._extra_night_preview_row(p_partner_reservation_id, p_addon_id, p_timing));
  END IF;
  RETURN jsonb_build_object('participantes', v_rows);
END $$;

-- ADMIN: aplicar (vincula directo; no toca la reserva principal ni el alojamiento base)
CREATE OR REPLACE FUNCTION public.admin_set_extra_night(p_reservation_id uuid, p_addon_id uuid, p_timing text,
  p_partner_reservation_id uuid DEFAULT NULL, p_nota text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event uuid; v_nombre text; v_before jsonb; v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT event_id INTO v_event FROM event_reservations WHERE id = p_reservation_id;
  IF NOT public._extra_night_eligible(p_reservation_id, v_event) THEN RAISE EXCEPTION 'participante_no_elegible'; END IF;
  SELECT nombre INTO v_nombre FROM event_addons WHERE id = p_addon_id;

  IF p_addon_id IS NOT NULL AND public._extra_night_is_shared(v_nombre) AND p_partner_reservation_id IS NOT NULL THEN
    v_id := public._extra_night_confirm_pair(v_event, p_reservation_id, p_partner_reservation_id, p_addon_id, p_timing, 'admin', p_nota);
    RETURN jsonb_build_object('ok', true, 'pairing_id', v_id, 'estado', 'confirmada');
  END IF;

  v_before := (SELECT to_jsonb(c) FROM public._extra_night_current(p_reservation_id) c);
  UPDATE extra_night_pairings SET estado = 'cancelada', resolved_at = now(), resolved_by = auth.uid()
   WHERE estado IN ('pendiente_companero','pendiente_aceptacion','confirmada')
     AND (reservation_id = p_reservation_id OR partner_reservation_id = p_reservation_id);
  PERFORM public._extra_night_apply(p_reservation_id, p_addon_id, p_timing);
  IF p_addon_id IS NOT NULL AND public._extra_night_is_shared(v_nombre) THEN
    INSERT INTO extra_night_pairings(event_id, reservation_id, addon_id, noche_timing, estado, origen, requested_by, nota)
    VALUES (v_event, p_reservation_id, p_addon_id, p_timing, 'pendiente_companero', 'admin', auth.uid(), p_nota) RETURNING id INTO v_id;
  END IF;
  PERFORM public._extra_night_log(v_event, p_reservation_id, NULL, v_id,
    CASE WHEN p_addon_id IS NULL THEN 'quitada' WHEN v_id IS NOT NULL THEN 'compartida_sin_companero' ELSE 'individual' END,
    COALESCE(v_before,'{}'), p_addon_id, p_timing, 'admin', p_nota);
  RETURN jsonb_build_object('ok', true, 'pairing_id', v_id, 'estado', CASE WHEN v_id IS NULL THEN 'aplicada' ELSE 'pendiente_companero' END);
END $$;

-- PARTICIPANTE (link público por token)
CREATE OR REPLACE FUNCTION public.manage_extra_night_by_token(p_token text, p_action text,
  p_addon_id uuid DEFAULT NULL, p_timing text DEFAULT NULL, p_partner_reservation_id uuid DEFAULT NULL,
  p_pairing_id uuid DEFAULT NULL, p_accept boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE er record; v_nombre text; v_before jsonb; p record; v_id uuid;
BEGIN
  IF p_token IS NULL OR p_token !~* '^[a-f0-9]{32,128}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_token'); END IF;
  SELECT * INTO er FROM event_reservations WHERE access_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF p_action = 'get' THEN
    RETURN jsonb_build_object('ok', true,
      'actual', (SELECT to_jsonb(c) FROM public._extra_night_current(er.id) c),
      'activa', (SELECT jsonb_build_object('id', x.id, 'estado', x.estado, 'timing', x.noche_timing, 'addon_id', x.addon_id,
                   'soy_solicitante', x.reservation_id = er.id,
                   'companero', public._extra_night_res_name(CASE WHEN x.reservation_id = er.id THEN x.partner_reservation_id ELSE x.reservation_id END, true))
                 FROM extra_night_pairings x WHERE x.estado IN ('pendiente_companero','pendiente_aceptacion','confirmada')
                   AND (x.reservation_id = er.id OR (x.partner_reservation_id = er.id AND x.estado = 'confirmada'))
                 ORDER BY x.created_at DESC LIMIT 1),
      'invitaciones', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'de', public._extra_night_res_name(x.reservation_id, true),
                   'timing', x.noche_timing, 'addon_id', x.addon_id))
                 FROM extra_night_pairings x WHERE x.partner_reservation_id = er.id AND x.estado = 'pendiente_aceptacion'), '[]'::jsonb),
      'elegibles', CASE WHEN public._extra_night_eligible(er.id, er.event_id) THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('reservation_id', o.id, 'nombre', public._extra_night_res_name(o.id, true)) ORDER BY public._extra_night_res_name(o.id, true))
                 FROM event_reservations o WHERE o.event_id = er.event_id AND o.id <> er.id
                   AND o.cancelled_at IS NULL AND o.reservation_status NOT IN ('cancelada','rechazada')
                   AND NOT EXISTS (SELECT 1 FROM extra_night_pairings y WHERE y.estado = 'confirmada'
                     AND (y.reservation_id = o.id OR y.partner_reservation_id = o.id))), '[]'::jsonb) ELSE '[]'::jsonb END);
  END IF;

  IF NOT public._extra_night_eligible(er.id, er.event_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'reservation_not_editable'); END IF;

  IF p_action = 'set_individual' THEN
    SELECT nombre INTO v_nombre FROM event_addons WHERE id = p_addon_id AND event_id = er.event_id;
    IF v_nombre IS NULL OR NOT public._extra_night_is_night(v_nombre) OR public._extra_night_is_shared(v_nombre) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'modalidad_invalida'); END IF;
    v_before := (SELECT to_jsonb(c) FROM public._extra_night_current(er.id) c);
    UPDATE extra_night_pairings SET estado = 'cancelada', resolved_at = now()
     WHERE estado IN ('pendiente_companero','pendiente_aceptacion','confirmada') AND (reservation_id = er.id OR partner_reservation_id = er.id);
    PERFORM public._extra_night_apply(er.id, p_addon_id, p_timing);
    PERFORM public._extra_night_log(er.event_id, er.id, NULL, NULL, 'individual', COALESCE(v_before,'{}'), p_addon_id, p_timing, 'participante', NULL);
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF p_action = 'request_shared' THEN
    SELECT nombre INTO v_nombre FROM event_addons WHERE id = p_addon_id AND event_id = er.event_id;
    IF v_nombre IS NULL OR NOT public._extra_night_is_shared(v_nombre) OR p_timing NOT IN ('antes','despues','ambas') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'modalidad_invalida'); END IF;
    IF p_partner_reservation_id IS NOT NULL AND NOT public._extra_night_eligible(p_partner_reservation_id, er.event_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'companero_no_elegible'); END IF;
    IF EXISTS (SELECT 1 FROM extra_night_pairings x WHERE x.estado = 'confirmada' AND (x.reservation_id = er.id OR x.partner_reservation_id = er.id)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ya_tenes_habitacion_confirmada'); END IF;
    UPDATE extra_night_pairings SET estado = 'cancelada', resolved_at = now()
     WHERE reservation_id = er.id AND estado IN ('pendiente_companero','pendiente_aceptacion');
    INSERT INTO extra_night_pairings(event_id, reservation_id, partner_reservation_id, addon_id, noche_timing, estado, origen)
    VALUES (er.event_id, er.id, p_partner_reservation_id, p_addon_id, p_timing,
      CASE WHEN p_partner_reservation_id IS NULL THEN 'pendiente_companero' ELSE 'pendiente_aceptacion' END, 'participante')
    RETURNING id INTO v_id;
    INSERT INTO extra_night_changes(event_id, reservation_id, partner_reservation_id, pairing_id, accion, addon_nuevo_id, timing_nuevo, origen)
    VALUES (er.event_id, er.id, p_partner_reservation_id, v_id,
      CASE WHEN p_partner_reservation_id IS NULL THEN 'solicita_compartir_sin_companero' ELSE 'invita_companero' END, p_addon_id, p_timing, 'participante');
    RETURN jsonb_build_object('ok', true, 'pairing_id', v_id);
  END IF;

  IF p_action = 'cancel_request' THEN
    UPDATE extra_night_pairings SET estado = 'cancelada', resolved_at = now()
     WHERE reservation_id = er.id AND estado IN ('pendiente_companero','pendiente_aceptacion');
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF p_action = 'respond' THEN
    SELECT * INTO p FROM extra_night_pairings WHERE id = p_pairing_id AND partner_reservation_id = er.id AND estado = 'pendiente_aceptacion';
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invitacion_no_encontrada'); END IF;
    IF COALESCE(p_accept, false) THEN
      PERFORM public._extra_night_confirm_pair(p.event_id, p.reservation_id, er.id, p.addon_id, p.noche_timing, 'participante', NULL, p.id);
    ELSE
      UPDATE extra_night_pairings SET estado = 'rechazada', resolved_at = now() WHERE id = p.id;
      INSERT INTO extra_night_changes(event_id, reservation_id, partner_reservation_id, pairing_id, accion, origen)
      VALUES (p.event_id, er.id, p.reservation_id, p.id, 'invitacion_rechazada', 'participante');
    END IF;
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
END $$;

REVOKE ALL ON FUNCTION public._extra_night_res_name(uuid, boolean), public._extra_night_eligible(uuid, uuid),
  public._extra_night_current(uuid), public._extra_night_apply(uuid, uuid, text), public._extra_night_preview_row(uuid, uuid, text),
  public._extra_night_log(uuid, uuid, uuid, uuid, text, jsonb, uuid, text, text, text),
  public._extra_night_confirm_pair(uuid, uuid, uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extra_night_preview(uuid, uuid, text, uuid), public.admin_set_extra_night(uuid, uuid, text, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_extra_night_preview(uuid, uuid, text, uuid), public.admin_set_extra_night(uuid, uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_extra_night_by_token(text, text, uuid, text, uuid, uuid, boolean) TO anon, authenticated;
