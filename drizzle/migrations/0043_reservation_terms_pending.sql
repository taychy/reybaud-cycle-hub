-- Condiciones pendientes para reservas cargadas por Administración (viajes).
ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS terminos_pendientes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminos_token text,
  ADD COLUMN IF NOT EXISTS terminos_token_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS event_reservations_terminos_token_key
  ON public.event_reservations (terminos_token) WHERE terminos_token IS NOT NULL;
COMMENT ON COLUMN public.event_reservations.terminos_pendientes IS 'true = reserva cargada sin aceptación de condiciones; bloquea cobros hasta aceptar';
COMMENT ON COLUMN public.event_reservations.terminos_token IS 'Token de un solo uso y solo para aceptar condiciones (no da acceso a la reserva)';

-- Espejo SQL de extractReglamentoWithDefaults (src/lib/eventReglamentoDefaults.ts). NULL si el evento no tiene condiciones.
CREATE OR REPLACE FUNCTION public.event_terms_snapshot(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; m jsonb; trip boolean; s text; c text; p text; r text; u text;
BEGIN
  SELECT type::text AS type, metadata INTO e FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  m := COALESCE(e.metadata, '{}'::jsonb);
  trip := e.type IN ('camp','viaje','training_camp');
  s := NULLIF(m->>'politica_sena','');
  c := COALESCE(NULLIF(m->>'politica_cancelacion',''), NULLIF(m->>'cancellation_text_full',''));
  p := NULLIF(m->>'politica_pagos','');
  r := NULLIF(m->>'reglamento_texto','');
  u := COALESCE(NULLIF(m->>'reglamento',''), NULLIF(m->>'reglamento_url',''), '');
  IF trip THEN
    s := COALESCE(s, 'La seña confirma tu lugar en el evento y NO es reembolsable. Se descuenta del total del paquete contratado.');
    c := COALESCE(c, E'• Hasta 30 días antes del inicio: devolución del saldo abonado (la seña no se reintegra).\n• Entre 30 y 15 días antes: 50% del saldo abonado (la seña no se reintegra).\n• Menos de 15 días antes o no presentarse: sin devolución.\n• Casos de fuerza mayor (lesión con certificado médico, fallecimiento de familiar directo) se evalúan individualmente y pueden generar crédito a favor para futuros eventos.');
    p := COALESCE(p, E'• El saldo puede abonarse en cuotas según el plan elegido al reservar.\n• Métodos de pago: Mercado Pago (link), transferencia bancaria o efectivo.\n• La última cuota vence 7 días antes del inicio del evento.\n• Si una cuota queda impaga, el equipo se contactará para regularizar antes de liberar el cupo.');
    r := COALESCE(r, E'PARTICIPACIÓN Y RESPONSABILIDAD\n• El participante declara estar en condiciones físicas para realizar la actividad y, si corresponde, contar con certificado médico vigente.\n• Es responsabilidad del participante contar con seguro de viaje y/o accidentes personales propio.\n\nEQUIPAMIENTO OBLIGATORIO\n• Casco homologado (uso obligatorio en todas las salidas).\n• Bicicleta en buen estado mecánico, revisada antes del viaje.\n• Luz delantera y trasera para salidas con poca luz.\n• Kit básico de reparación (cámara, infladores, herramientas).\n\nDURANTE EL EVENTO\n• Respetar los horarios de salida y el ritmo del grupo asignado.\n• Seguir las indicaciones de coaches y guías en todo momento.\n• Respetar a compañeros/as, staff, alojamiento y entorno natural.\n• Durante las salidas en bicicleta se prioriza la seguridad y el consumo responsable. Las degustaciones de vino previstas en el programa se realizan en los momentos y lugares organizados para esa actividad.\n\nALOJAMIENTO Y CONVIVENCIA\n• Cuidar el alojamiento y los espacios comunes.\n• Respetar los horarios de descanso del grupo.\n• Cualquier daño causado al alojamiento corre por cuenta del participante.\n\nDERECHO DE ADMISIÓN\nLa organización se reserva el derecho de admisión y permanencia ante incumplimiento del reglamento, sin generar derecho a reembolso.\n\nUSO DE IMAGEN\nDurante el evento se toman fotos y videos que pueden usarse con fines de difusión de la escuela. Si no querés aparecer, avisanos al inicio del viaje.');
  END IF;
  IF s IS NULL AND c IS NULL AND p IS NULL AND r IS NULL AND u = '' THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('politica_sena', COALESCE(s,''), 'politica_cancelacion', COALESCE(c,''),
    'politica_pagos', COALESCE(p,''), 'reglamento_texto', COALESCE(r,''), 'reglamento_url', u,
    'version', COALESCE(NULLIF(m->>'terminos_version',''), '1'))
    || CASE WHEN m ? 'cancellation_rules' THEN jsonb_build_object('cancellation_rules', m->'cancellation_rules') ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION public.event_terms_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_terms_snapshot(uuid) TO authenticated, service_role;

-- Alta por Administración sin aceptación: queda con condiciones pendientes + enlace de 30 días.
CREATE OR REPLACE FUNCTION public.trg_reservation_terms_pending_on_admin_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by = 'admin' AND NEW.terminos_aceptados_at IS NULL
     AND public.event_terms_snapshot(NEW.event_id) IS NOT NULL THEN
    NEW.accepted_terms := false;
    NEW.terminos_pendientes := true;
    NEW.terminos_token := encode(extensions.gen_random_bytes(24), 'hex');
    NEW.terminos_token_expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_reservation_terms_pending ON public.event_reservations;
CREATE TRIGGER trg_reservation_terms_pending BEFORE INSERT ON public.event_reservations
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_terms_pending_on_admin_insert();

-- Nadie puede limpiar el pendiente o tocar el token salvo vía RPC o un admin.
CREATE OR REPLACE FUNCTION public.trg_reservation_terms_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.terms_internal', true) = 'on' OR auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN NEW; END IF;
  IF NEW.terminos_pendientes IS DISTINCT FROM OLD.terminos_pendientes
     OR NEW.terminos_token IS DISTINCT FROM OLD.terminos_token
     OR NEW.terminos_token_expires_at IS DISTINCT FROM OLD.terminos_token_expires_at
     OR (OLD.terminos_pendientes AND (NEW.terminos_aceptados_at IS DISTINCT FROM OLD.terminos_aceptados_at
         OR NEW.terminos_snapshot IS DISTINCT FROM OLD.terminos_snapshot
         OR NEW.terminos_version_aceptada IS DISTINCT FROM OLD.terminos_version_aceptada
         OR NEW.accepted_terms IS DISTINCT FROM OLD.accepted_terms)) THEN
    RAISE EXCEPTION 'Las condiciones solo se aceptan desde el enlace o el botón de aceptación';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_reservation_terms_guard ON public.event_reservations;
CREATE TRIGGER trg_reservation_terms_guard BEFORE UPDATE ON public.event_reservations
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_terms_guard();

-- Núcleo único de aceptación (mismo snapshot que el flujo de alumno).
CREATE OR REPLACE FUNCTION public._accept_reservation_terms(p_reservation_id uuid, p_version text, p_canal text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; snap jsonb; v_at timestamptz := now();
BEGIN
  SELECT * INTO r FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF NOT r.terminos_pendientes THEN RAISE EXCEPTION 'Esta reserva no tiene condiciones pendientes'; END IF;
  snap := public.event_terms_snapshot(r.event_id);
  IF snap IS NULL THEN RAISE EXCEPTION 'El viaje no tiene condiciones cargadas'; END IF;
  IF p_version IS DISTINCT FROM snap->>'version' THEN
    RAISE EXCEPTION 'Las condiciones se actualizaron. Recargá la página para leer la versión vigente.';
  END IF;
  snap := snap || jsonb_build_object('aceptado_at', v_at, 'canal', p_canal, 'aceptado_por_user_id', auth.uid());
  PERFORM set_config('app.terms_internal', 'on', true);
  UPDATE public.event_reservations SET accepted_terms = true, terminos_aceptados_at = v_at,
    terminos_version_aceptada = snap->>'version', terminos_snapshot = snap,
    terminos_pendientes = false, terminos_token = NULL, terminos_token_expires_at = NULL, updated_at = v_at
  WHERE id = p_reservation_id;
  PERFORM set_config('app.terms_internal', 'off', true);
  INSERT INTO public.reservation_status_history (reservation_id, old_reservation_status, new_reservation_status,
    old_payment_status, new_payment_status, changed_by, changed_by_role, note)
  VALUES (r.id, r.reservation_status, r.reservation_status, r.payment_status, r.payment_status, auth.uid(),
    CASE WHEN p_canal = 'enlace' THEN 'participante_enlace' ELSE 'alumno' END,
    'Condiciones aceptadas (versión ' || (snap->>'version') || ')');
  RETURN jsonb_build_object('ok', true, 'aceptado_at', v_at, 'version', snap->>'version');
END $$;
REVOKE ALL ON FUNCTION public._accept_reservation_terms(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Lectura pública por token: solo datos para leer y aceptar, nada más.
CREATE OR REPLACE FUNCTION public.get_reservation_terms_by_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; ev record; nombre text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN jsonb_build_object('status','invalido'); END IF;
  SELECT * INTO r FROM public.event_reservations WHERE terminos_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalido'); END IF;
  IF r.terminos_token_expires_at IS NULL OR r.terminos_token_expires_at < now() THEN
    RETURN jsonb_build_object('status','expirado');
  END IF;
  SELECT title, date, end_date INTO ev FROM public.events WHERE id = r.event_id;
  SELECT COALESCE(a.nombre, r.external_first_name) INTO nombre FROM (SELECT 1) x
    LEFT JOIN public.alumnos a ON a.id = r.alumno_id;
  RETURN jsonb_build_object('status','pendiente', 'event_title', ev.title, 'event_date', ev.date,
    'event_end_date', ev.end_date, 'package', r.package_nombre_snapshot,
    'nombre', split_part(COALESCE(nombre, r.external_first_name, ''), ' ', 1),
    'terms', public.event_terms_snapshot(r.event_id));
END $$;
GRANT EXECUTE ON FUNCTION public.get_reservation_terms_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_reservation_terms_by_token(p_token text, p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.event_reservations
  WHERE terminos_token = p_token AND p_token IS NOT NULL AND length(p_token) >= 32
    AND terminos_token_expires_at >= now() AND terminos_pendientes;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Enlace inválido o vencido. Pedile uno nuevo a Administración.'; END IF;
  RETURN public._accept_reservation_terms(v_id, p_version, 'enlace');
END $$;
GRANT EXECUTE ON FUNCTION public.accept_reservation_terms_by_token(text, text) TO anon, authenticated;

-- Alumno con sesión: acepta desde su app (sin token).
CREATE OR REPLACE FUNCTION public.accept_my_reservation_terms(p_reservation_id uuid, p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.event_reservations
     WHERE id = p_reservation_id AND alumno_id IN (SELECT public.current_alumno_id())) THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;
  RETURN public._accept_reservation_terms(p_reservation_id, p_version, 'app_alumno');
END $$;
REVOKE ALL ON FUNCTION public.accept_my_reservation_terms(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_my_reservation_terms(uuid, text) TO authenticated;

-- Administración: generar/renovar enlace (30 días).
CREATE OR REPLACE FUNCTION public.admin_renew_reservation_terms_link(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text := encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo Administración';
  END IF;
  PERFORM set_config('app.terms_internal', 'on', true);
  UPDATE public.event_reservations SET terminos_token = t, terminos_token_expires_at = now() + interval '30 days'
  WHERE id = p_reservation_id AND terminos_pendientes;
  PERFORM set_config('app.terms_internal', 'off', true);
  IF NOT FOUND THEN RAISE EXCEPTION 'La reserva no tiene condiciones pendientes'; END IF;
  RETURN jsonb_build_object('token', t, 'expires_at', now() + interval '30 days');
END $$;
REVOKE ALL ON FUNCTION public.admin_renew_reservation_terms_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_renew_reservation_terms_link(uuid) TO authenticated;

-- Sin aceptación no se valida ningún pago desde la app (admin ni alumno).
CREATE OR REPLACE FUNCTION public.trg_block_payment_terms_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'validado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validado')
     AND auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.event_reservations WHERE id = NEW.reservation_id AND terminos_pendientes) THEN
    RAISE EXCEPTION 'Condiciones pendientes: el participante tiene que aceptar las condiciones antes de registrar la seña o cualquier pago.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_payment_terms_pending ON public.reservation_payments;
CREATE TRIGGER trg_block_payment_terms_pending BEFORE INSERT OR UPDATE OF status ON public.reservation_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_payment_terms_pending();