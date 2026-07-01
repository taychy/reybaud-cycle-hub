
-- =============================================================================
-- 1) CONFIG POR EVENTO
-- =============================================================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS permite_cambio_paquete_alumno boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dias_limite_cambio_alumno integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS permitir_downgrade boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS politica_precio_cambio text NOT NULL DEFAULT 'vigente'
    CHECK (politica_precio_cambio IN ('vigente','conserva_etapa','diferencia_protegida')),
  ADD COLUMN IF NOT EXISTS credito_valido_solo_en_evento boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bloquear_cambios_despues_de_inicio boolean NOT NULL DEFAULT true;

-- =============================================================================
-- 2) TABLA: SOLICITUDES DE CAMBIO
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.event_package_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  package_actual_id uuid REFERENCES public.event_packages(id) ON DELETE SET NULL,
  package_nuevo_id uuid NOT NULL REFERENCES public.event_packages(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aprobada','rechazada','aplicada','expirada','cancelada')),
  preview_snapshot jsonb,
  motivo_alumno text,
  nota_admin text,
  roommate_propuesto_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  override_plaza_libre boolean NOT NULL DEFAULT false,
  requested_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  applied_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epcr_reservation ON public.event_package_change_requests(reservation_id);
CREATE INDEX IF NOT EXISTS idx_epcr_alumno ON public.event_package_change_requests(alumno_id);
CREATE INDEX IF NOT EXISTS idx_epcr_event ON public.event_package_change_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_epcr_estado ON public.event_package_change_requests(estado);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_epcr_pending_per_reservation
  ON public.event_package_change_requests(reservation_id)
  WHERE estado = 'pendiente';

GRANT SELECT, INSERT, UPDATE ON public.event_package_change_requests TO authenticated;
GRANT ALL ON public.event_package_change_requests TO service_role;

ALTER TABLE public.event_package_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "epcr_alumno_select_own" ON public.event_package_change_requests
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM public.alumnos WHERE email = auth.email())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "epcr_alumno_insert_own" ON public.event_package_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    alumno_id IN (SELECT id FROM public.alumnos WHERE email = auth.email())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "epcr_admin_manage" ON public.event_package_change_requests
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE TRIGGER trg_epcr_updated_at
  BEFORE UPDATE ON public.event_package_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 3) TABLA: AJUSTES FINANCIEROS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reservation_financial_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'credito_por_downgrade',
    'debito_por_upgrade',
    'descuento_admin',
    'reembolso_emitido',
    'credito_aplicado_addon',
    'credito_aplicado_cuota',
    'ajuste_manual'
  )),
  monto_original numeric(14,2) NOT NULL,
  monto_disponible numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  estado text NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo','consumido','vencido','reembolsado','anulado')),
  origen_cambio_id uuid REFERENCES public.event_package_change_requests(id) ON DELETE SET NULL,
  motivo text,
  vence_el timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_rfa_reservation ON public.reservation_financial_adjustments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_rfa_alumno ON public.reservation_financial_adjustments(alumno_id);
CREATE INDEX IF NOT EXISTS idx_rfa_event ON public.reservation_financial_adjustments(event_id);
CREATE INDEX IF NOT EXISTS idx_rfa_estado ON public.reservation_financial_adjustments(estado);

GRANT SELECT ON public.reservation_financial_adjustments TO authenticated;
GRANT ALL ON public.reservation_financial_adjustments TO service_role;

ALTER TABLE public.reservation_financial_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfa_alumno_select_own" ON public.reservation_financial_adjustments
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM public.alumnos WHERE email = auth.email())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "rfa_admin_manage" ON public.reservation_financial_adjustments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE TRIGGER trg_rfa_updated_at
  BEFORE UPDATE ON public.reservation_financial_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 4) VISTA: v_reservation_account
-- =============================================================================
CREATE OR REPLACE VIEW public.v_reservation_account AS
SELECT
  r.id AS reservation_id,
  r.alumno_id,
  r.event_id,
  r.amount_total,
  r.amount_paid,
  r.balance_due,
  r.currency_snapshot AS moneda,
  COALESCE((
    SELECT SUM(monto_disponible)
    FROM public.reservation_financial_adjustments a
    WHERE a.reservation_id = r.id
      AND a.tipo IN ('credito_por_downgrade','descuento_admin','ajuste_manual')
      AND a.estado = 'activo'
      AND a.monto_original > 0
  ), 0) AS credito_disponible,
  COALESCE((
    SELECT SUM(monto_original)
    FROM public.reservation_financial_adjustments a
    WHERE a.reservation_id = r.id
      AND a.tipo = 'debito_por_upgrade'
      AND a.estado = 'activo'
  ), 0) AS debitos_pendientes,
  COALESCE((
    SELECT SUM(monto_original)
    FROM public.reservation_financial_adjustments a
    WHERE a.reservation_id = r.id
      AND a.tipo = 'reembolso_emitido'
  ), 0) AS reembolsado
FROM public.event_reservations r;

GRANT SELECT ON public.v_reservation_account TO authenticated;

-- =============================================================================
-- 5) HELPERS
-- =============================================================================

-- Precio vigente de un paquete según etapas (o precio base)
CREATE OR REPLACE FUNCTION public.get_package_active_price(p_package_id uuid, p_now timestamptz DEFAULT now())
RETURNS TABLE(precio numeric, currency text, stage_id uuid, stage_nombre text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_precio numeric;
  v_base_currency text;
BEGIN
  SELECT ep.precio, ep.currency INTO v_base_precio, v_base_currency
  FROM public.event_packages ep WHERE ep.id = p_package_id;

  RETURN QUERY
  SELECT s.precio, COALESCE(s.currency, v_base_currency), s.id, s.nombre
  FROM public.event_package_price_stages s
  WHERE s.package_id = p_package_id
    AND s.activo = true
    AND s.vigente_desde <= p_now
    AND (s.vigente_hasta IS NULL OR s.vigente_hasta > p_now)
  ORDER BY s.vigente_desde DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_base_precio, v_base_currency, NULL::uuid, NULL::text;
  END IF;
END;
$$;

-- Cupo disponible de un paquete
CREATE OR REPLACE FUNCTION public.get_package_available_spots(p_package_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cupo integer;
  v_taken integer;
BEGIN
  SELECT cupo INTO v_cupo FROM public.event_packages WHERE id = p_package_id;
  IF v_cupo IS NULL THEN RETURN 999999; END IF;

  SELECT COUNT(*) INTO v_taken
  FROM public.event_reservations
  WHERE package_id = p_package_id
    AND reservation_status NOT IN ('cancelada','rechazada','expirada');

  RETURN GREATEST(v_cupo - v_taken, 0);
END;
$$;

-- Evaluación de impacto en habitación
CREATE OR REPLACE FUNCTION public.evaluate_room_impact(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_roommate_propuesto_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation record;
  v_pkg_actual record;
  v_pkg_nuevo record;
  v_status text := 'auto_applicable';
  v_razones text[] := ARRAY[]::text[];
  v_compa_count integer;
  v_pers_habitacion_actual integer;
  v_pers_habitacion_nueva integer;
  v_roommate_valido boolean := NULL;
BEGIN
  SELECT * INTO v_reservation FROM public.event_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','no_posible','razones', to_jsonb(ARRAY['Reserva no encontrada']));
  END IF;

  SELECT * INTO v_pkg_actual FROM public.event_packages WHERE id = v_reservation.package_id;
  SELECT * INTO v_pkg_nuevo FROM public.event_packages WHERE id = p_package_nuevo_id;

  IF v_pkg_nuevo IS NULL THEN
    RETURN jsonb_build_object('status','no_posible','razones', to_jsonb(ARRAY['Paquete destino no existe']));
  END IF;

  v_pers_habitacion_actual := COALESCE(v_pkg_actual.personas_por_habitacion, 1);
  v_pers_habitacion_nueva := COALESCE(v_pkg_nuevo.personas_por_habitacion, 1);

  -- ¿Sale de una habitación compartida?
  IF v_pers_habitacion_actual > 1 THEN
    SELECT COUNT(*) INTO v_compa_count
    FROM public.reservation_roommates
    WHERE reservation_id = p_reservation_id
      AND alumno_id IS NOT NULL;
    IF v_compa_count > 0 AND v_pers_habitacion_nueva <> v_pers_habitacion_actual THEN
      v_status := 'requiere_aprobacion';
      v_razones := array_append(v_razones,
        'Este cambio deja plazas libres en tu habitación actual compartida');
    END IF;
  END IF;

  -- ¿Entra a compartida y no propone roommate?
  IF v_pers_habitacion_nueva > 1 AND p_roommate_propuesto_id IS NULL THEN
    IF v_pers_habitacion_actual <= 1 THEN
      v_status := CASE WHEN v_status = 'auto_applicable' THEN 'requiere_aprobacion' ELSE v_status END;
      v_razones := array_append(v_razones,
        'Al pasar a habitación compartida necesitás proponer un compañero o esperar asignación admin');
    END IF;
  END IF;

  -- Validar roommate propuesto
  IF p_roommate_propuesto_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.event_reservations
      WHERE alumno_id = p_roommate_propuesto_id
        AND event_id = v_reservation.event_id
        AND reservation_status NOT IN ('cancelada','rechazada','expirada')
    ) THEN
      v_roommate_valido := true;
    ELSE
      v_roommate_valido := false;
      v_status := 'no_posible';
      v_razones := array_append(v_razones,
        'El compañero propuesto no está inscripto en el evento');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'habitacion_origen', jsonb_build_object(
      'tipo', v_pkg_actual.nombre,
      'personas', v_pers_habitacion_actual,
      'companeros_asignados', COALESCE(v_compa_count, 0)
    ),
    'habitacion_destino', jsonb_build_object(
      'tipo', v_pkg_nuevo.nombre,
      'personas', v_pers_habitacion_nueva
    ),
    'roommate_propuesto_valido', v_roommate_valido,
    'razones', to_jsonb(v_razones)
  );
END;
$$;

-- Clasificación de cambio
CREATE OR REPLACE FUNCTION public.classify_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_room_impact jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual record;
  v_nuevo record;
  v_room_status text;
BEGIN
  SELECT ep.* INTO v_actual FROM public.event_reservations r
    LEFT JOIN public.event_packages ep ON ep.id = r.package_id
    WHERE r.id = p_reservation_id;
  SELECT * INTO v_nuevo FROM public.event_packages WHERE id = p_package_nuevo_id;
  v_room_status := p_room_impact->>'status';

  IF v_actual IS NULL OR v_nuevo IS NULL THEN RETURN 'comercial_simple'; END IF;

  IF v_room_status = 'no_posible' THEN RETURN 'estructural'; END IF;

  IF COALESCE(v_actual.personas_por_habitacion,1) > 1
     AND COALESCE(v_nuevo.personas_por_habitacion,1) <> COALESCE(v_actual.personas_por_habitacion,1) THEN
    RETURN 'habitacional';
  END IF;

  IF v_nuevo.precio < v_actual.precio THEN RETURN 'economico'; END IF;

  RETURN 'comercial_simple';
END;
$$;

-- =============================================================================
-- 6) PREVIEW (read-only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.preview_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_roommate_propuesto_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation record;
  v_event record;
  v_pkg_actual record;
  v_pkg_nuevo record;
  v_precio_actual numeric;
  v_precio_nuevo numeric;
  v_currency_nuevo text;
  v_stage_id uuid;
  v_stage_nombre text;
  v_available_spots integer;
  v_amount_paid numeric;
  v_diff numeric;
  v_credit numeric := 0;
  v_debit numeric := 0;
  v_room jsonb;
  v_status text := 'auto_applicable';
  v_clasif text;
  v_warnings text[] := ARRAY[]::text[];
  v_blockers text[] := ARRAY[]::text[];
  v_days_to_event integer;
  v_token text;
BEGIN
  SELECT * INTO v_reservation FROM public.event_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','no_posible','blockers', to_jsonb(ARRAY['Reserva no encontrada']));
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_reservation.event_id;
  SELECT * INTO v_pkg_actual FROM public.event_packages WHERE id = v_reservation.package_id;
  SELECT * INTO v_pkg_nuevo FROM public.event_packages WHERE id = p_package_nuevo_id;

  -- Reglas duras
  IF v_pkg_nuevo IS NULL OR v_pkg_nuevo.activo = false THEN
    v_blockers := array_append(v_blockers, 'El paquete destino no existe o está inactivo');
  END IF;
  IF p_package_nuevo_id = v_reservation.package_id THEN
    v_blockers := array_append(v_blockers, 'Ya tenés este paquete');
  END IF;
  IF v_reservation.reservation_status IN ('cancelada','rechazada','expirada') THEN
    v_blockers := array_append(v_blockers, 'Esta reserva no admite modificaciones');
  END IF;
  IF v_event.bloquear_cambios_despues_de_inicio
     AND v_event.date IS NOT NULL AND v_event.date <= CURRENT_DATE THEN
    v_blockers := array_append(v_blockers, 'El evento ya inició; solicitá cambios manuales al admin');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.event_package_change_requests
    WHERE reservation_id = p_reservation_id AND estado = 'pendiente'
  ) THEN
    v_blockers := array_append(v_blockers, 'Ya tenés una solicitud pendiente para esta reserva');
  END IF;

  -- Cupo
  v_available_spots := public.get_package_available_spots(p_package_nuevo_id);
  IF v_available_spots <= 0 THEN
    v_blockers := array_append(v_blockers, 'El paquete destino no tiene cupos disponibles');
  END IF;

  IF array_length(v_blockers,1) > 0 THEN
    RETURN jsonb_build_object(
      'status','no_posible',
      'blockers', to_jsonb(v_blockers),
      'package_actual', to_jsonb(v_pkg_actual),
      'package_nuevo', to_jsonb(v_pkg_nuevo)
    );
  END IF;

  -- Precio nuevo según política
  SELECT precio, currency, stage_id, stage_nombre
    INTO v_precio_nuevo, v_currency_nuevo, v_stage_id, v_stage_nombre
    FROM public.get_package_active_price(p_package_nuevo_id, now());

  v_precio_actual := COALESCE(v_reservation.price_snapshot, v_pkg_actual.precio, 0);
  v_amount_paid := COALESCE(v_reservation.amount_paid, 0);
  v_diff := v_precio_nuevo - v_precio_actual;

  IF v_diff < 0 THEN
    v_credit := ABS(v_diff);
    v_warnings := array_append(v_warnings, 'Se generará un crédito dentro del evento por la diferencia');
    IF NOT v_event.permitir_downgrade THEN
      RETURN jsonb_build_object(
        'status','no_posible',
        'blockers', to_jsonb(ARRAY['Este evento no permite bajar de paquete'])
      );
    END IF;
  ELSIF v_diff > 0 THEN
    v_debit := v_diff;
    v_warnings := array_append(v_warnings, 'Se recalculan las cuotas pendientes con la diferencia');
  END IF;

  -- Impacto habitación
  v_room := public.evaluate_room_impact(p_reservation_id, p_package_nuevo_id, p_roommate_propuesto_id);
  v_clasif := public.classify_package_change(p_reservation_id, p_package_nuevo_id, v_room);

  IF (v_room->>'status') = 'no_posible' THEN
    RETURN jsonb_build_object(
      'status','no_posible',
      'blockers', to_jsonb(ARRAY['El cambio no es posible: ' || COALESCE((v_room->'razones'->>0), 'razones de habitación')]),
      'room_impact', v_room
    );
  END IF;

  -- Ventana temporal alumno
  IF v_event.date IS NOT NULL THEN
    v_days_to_event := (v_event.date - CURRENT_DATE);
    IF v_days_to_event < v_event.dias_limite_cambio_alumno THEN
      v_status := 'requiere_aprobacion';
      v_warnings := array_append(v_warnings,
        'Estamos dentro de los ' || v_event.dias_limite_cambio_alumno || ' días previos: requiere aprobación admin');
    END IF;
  END IF;

  -- Downgrade siempre requiere aprobación
  IF v_credit > 0 AND v_amount_paid > 0 THEN
    v_status := 'requiere_aprobacion';
  END IF;

  -- Room impact sobreescribe
  IF (v_room->>'status') = 'requiere_aprobacion' THEN
    v_status := 'requiere_aprobacion';
  END IF;

  -- Token de revalidación
  v_token := md5(
    p_reservation_id::text || '|' ||
    p_package_nuevo_id::text || '|' ||
    v_available_spots::text || '|' ||
    v_precio_nuevo::text || '|' ||
    COALESCE(v_stage_id::text,'') || '|' ||
    v_reservation.updated_at::text
  );

  RETURN jsonb_build_object(
    'status', v_status,
    'clasificacion', v_clasif,
    'package_actual', jsonb_build_object(
      'id', v_pkg_actual.id,
      'nombre', v_pkg_actual.nombre,
      'precio_pagado_reserva', v_precio_actual,
      'personas_por_habitacion', v_pkg_actual.personas_por_habitacion
    ),
    'package_nuevo', jsonb_build_object(
      'id', v_pkg_nuevo.id,
      'nombre', v_pkg_nuevo.nombre,
      'precio_aplicable', v_precio_nuevo,
      'currency', v_currency_nuevo,
      'etapa_vigente', v_stage_nombre,
      'cupos_disponibles', v_available_spots,
      'personas_por_habitacion', v_pkg_nuevo.personas_por_habitacion
    ),
    'politica_precio_aplicada', v_event.politica_precio_cambio,
    'amount_paid', v_amount_paid,
    'difference', v_diff,
    'credit_to_create', v_credit,
    'debit_to_create', v_debit,
    'room_impact', v_room,
    'warnings', to_jsonb(v_warnings),
    'blockers', to_jsonb(ARRAY[]::text[]),
    'revalidation_token', v_token,
    'days_to_event', v_days_to_event
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_package_change(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_room_impact(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_package_change(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_package_active_price(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_package_available_spots(uuid) TO authenticated;

-- =============================================================================
-- 7) APPLY (transaccional)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.apply_package_change(
  p_reservation_id uuid,
  p_package_nuevo_id uuid,
  p_revalidation_token text,
  p_request_id uuid DEFAULT NULL,
  p_override_plaza_libre boolean DEFAULT false,
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview jsonb;
  v_status text;
  v_credit numeric;
  v_debit numeric;
  v_precio_nuevo numeric;
  v_currency_nuevo text;
  v_reservation record;
  v_event record;
  v_pkg_nuevo record;
  v_is_admin boolean;
  v_adj_id uuid;
BEGIN
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());

  -- Lock
  SELECT * INTO v_reservation FROM public.event_reservations
    WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_reservation.event_id;
  SELECT * INTO v_pkg_nuevo FROM public.event_packages WHERE id = p_package_nuevo_id FOR UPDATE;

  -- Re-preview y comparar token
  v_preview := public.preview_package_change(p_reservation_id, p_package_nuevo_id, NULL);
  v_status := v_preview->>'status';

  IF v_status = 'no_posible' THEN
    RAISE EXCEPTION 'El cambio no es posible: %', v_preview->'blockers';
  END IF;

  IF (v_preview->>'revalidation_token') IS DISTINCT FROM p_revalidation_token THEN
    RAISE EXCEPTION 'El estado del paquete cambió mientras confirmabas. Recargá y volvé a intentar.';
  END IF;

  IF v_status = 'requiere_aprobacion' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Este cambio requiere aprobación admin. Enviá una solicitud.';
  END IF;

  v_credit := COALESCE((v_preview->>'credit_to_create')::numeric, 0);
  v_debit := COALESCE((v_preview->>'debit_to_create')::numeric, 0);
  v_precio_nuevo := (v_preview->'package_nuevo'->>'precio_aplicable')::numeric;
  v_currency_nuevo := v_preview->'package_nuevo'->>'currency';

  -- Snapshot en status history si existe la tabla
  BEGIN
    INSERT INTO public.reservation_status_history
      (reservation_id, previous_status, new_status, changed_by, reason, metadata)
    VALUES (p_reservation_id, v_reservation.reservation_status, v_reservation.reservation_status,
            auth.uid(), 'Cambio de paquete',
            jsonb_build_object('preview', v_preview, 'package_actual', v_reservation.package_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Update reserva
  UPDATE public.event_reservations SET
    package_id = p_package_nuevo_id,
    package_nombre_snapshot = v_pkg_nuevo.nombre,
    price_snapshot = CASE
      WHEN v_event.politica_precio_cambio = 'conserva_etapa' THEN v_reservation.price_snapshot
      ELSE v_precio_nuevo
    END,
    currency_snapshot = v_currency_nuevo,
    amount_total = CASE
      WHEN v_event.politica_precio_cambio = 'conserva_etapa' THEN v_reservation.amount_total
      ELSE v_precio_nuevo
    END,
    balance_due = GREATEST(v_precio_nuevo - v_reservation.amount_paid, 0),
    updated_at = now()
  WHERE id = p_reservation_id;

  -- Crear ajuste financiero
  IF v_credit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by,
       vence_el)
    VALUES (p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
            'credito_por_downgrade', v_credit, v_credit, v_currency_nuevo,
            p_request_id, COALESCE(p_admin_note, 'Cambio a paquete más económico'), auth.uid(),
            CASE WHEN v_event.credito_valido_solo_en_evento
                 AND v_event.date IS NOT NULL
                 THEN (v_event.date::timestamptz + interval '30 days')
                 ELSE NULL END)
    RETURNING id INTO v_adj_id;
  ELSIF v_debit > 0 THEN
    INSERT INTO public.reservation_financial_adjustments
      (reservation_id, alumno_id, event_id, tipo, monto_original, monto_disponible, moneda,
       origen_cambio_id, motivo, created_by)
    VALUES (p_reservation_id, v_reservation.alumno_id, v_reservation.event_id,
            'debito_por_upgrade', v_debit, 0, v_currency_nuevo,
            p_request_id, COALESCE(p_admin_note, 'Cambio a paquete de mayor valor'), auth.uid())
    RETURNING id INTO v_adj_id;
  END IF;

  -- Marcar request como aplicada
  IF p_request_id IS NOT NULL THEN
    UPDATE public.event_package_change_requests
      SET estado = 'aplicada',
          applied_at = now(),
          resolved_at = COALESCE(resolved_at, now()),
          resolved_by = COALESCE(resolved_by, auth.uid()),
          override_plaza_libre = p_override_plaza_libre,
          nota_admin = COALESCE(nota_admin, p_admin_note)
      WHERE id = p_request_id;
  END IF;

  -- Log
  BEGIN
    INSERT INTO public.student_activity_log
      (alumno_id, event_type, title, description, actor_id, actor_role, reference_type, reference_id)
    VALUES (v_reservation.alumno_id, 'package_change',
            'Cambio de paquete aplicado',
            'De ' || COALESCE(v_reservation.package_nombre_snapshot,'—') || ' a ' || v_pkg_nuevo.nombre,
            auth.uid(),
            CASE WHEN v_is_admin THEN 'admin' ELSE 'alumno' END,
            'event_reservation', p_reservation_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', p_reservation_id,
    'new_package_id', p_package_nuevo_id,
    'adjustment_id', v_adj_id,
    'credit_created', v_credit,
    'debit_created', v_debit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_package_change(uuid, uuid, text, uuid, boolean, text) TO authenticated;
