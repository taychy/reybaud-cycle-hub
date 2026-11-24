-- 0117 · Cobro de clases eventuales (turnera) en la RESERVA, nunca como mensualidad.
-- PENDIENTE: no aplicar sin autorización. Aditivo: no toca vw_cuenta_corriente_movimientos,
-- sync_turnera_cuenta_corriente, precios, suscripciones ni vínculos históricos.
-- El haber lo sigue creando sync_turnera_cuenta_corriente (1 crédito por reserva);
-- por eso este flujo NUNCA escribe pagos_imputaciones.

-- 1) Deudas de turnera del alumno (solo lectura, admin).
CREATE OR REPLACE FUNCTION public.get_alumno_turnera_debts(_alumno_id uuid)
RETURNS TABLE (id uuid, label text, fecha date, hora_inicio time, currency text, amount numeric, pago_estado text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administración' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id,
         'Clase eventual / Turnera: ' || COALESCE(s.nombre, 'servicio') || ' — ' || to_char(r.fecha, 'DD/MM/YYYY') || ' ' || to_char(r.hora_inicio, 'HH24:MI'),
         r.fecha, r.hora_inicio, COALESCE(r.moneda_snapshot, 'ARS'), r.precio_snapshot, r.pago_estado
  FROM public.reservas_turnera r
  LEFT JOIN public.servicios_turnera s ON s.id = r.servicio_id
  WHERE r.alumno_id = _alumno_id
    AND COALESCE(r.estado_operativo, '') NOT LIKE 'cancelada%'
    AND COALESCE(r.precio_snapshot, 0) > 0
    AND NOT (COALESCE(r.estado_economico, '') = 'pagado' OR COALESCE(r.pago_estado, '') = 'aprobado')
  ORDER BY r.fecha, r.hora_inicio;
END $$;
REVOKE ALL ON FUNCTION public.get_alumno_turnera_debts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_alumno_turnera_debts(uuid) TO authenticated;

-- 2) Registrar/vincular el pago de UNA reserva concreta (manual o MP), idempotente.
CREATE OR REPLACE FUNCTION public.admin_register_turnera_payment(
  _reserva_id uuid, _monto numeric, _moneda text, _metodo text,
  _mp_movement_id uuid DEFAULT NULL, _alumno_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservas_turnera%ROWTYPE; m record; v_mp text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo administración' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.reservas_turnera WHERE id = _reserva_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva de turnera inexistente'; END IF;
  IF _alumno_id IS NOT NULL AND r.alumno_id IS DISTINCT FROM _alumno_id THEN
    RAISE EXCEPTION 'La reserva pertenece a otro alumno';
  END IF;
  IF r.alumno_id IS NULL THEN RAISE EXCEPTION 'La reserva no está vinculada a un alumno'; END IF;
  IF COALESCE(r.estado_operativo, '') LIKE 'cancelada%' THEN
    RAISE EXCEPTION 'La reserva está cancelada: no se registra el pago (revisión manual)';
  END IF;
  IF upper(COALESCE(_moneda, '')) <> upper(COALESCE(r.moneda_snapshot, 'ARS')) THEN
    RAISE EXCEPTION 'Moneda distinta a la de la reserva';
  END IF;
  IF _monto IS NULL OR _monto <= 0 OR _monto <> COALESCE(r.precio_snapshot, 0) THEN
    RAISE EXCEPTION 'El importe debe coincidir con el precio de la reserva';
  END IF;

  IF _mp_movement_id IS NOT NULL THEN
    SELECT * INTO m FROM public.mp_account_movements WHERE id = _mp_movement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento de Mercado Pago inexistente'; END IF;
    v_mp := m.mp_payment_id::text;
    -- Idempotencia: mismo cobro ya aplicado a esta misma reserva.
    IF r.pago_mp_payment_id IS NOT DISTINCT FROM v_mp
       AND (COALESCE(r.estado_economico,'') = 'pagado' OR COALESCE(r.pago_estado,'') = 'aprobado') THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true);
    END IF;
    IF m.alumno_id IS NOT NULL AND m.alumno_id <> r.alumno_id THEN
      RAISE EXCEPTION 'El cobro de Mercado Pago es de otro alumno';
    END IF;
    IF upper(COALESCE(m.currency, 'ARS')) <> upper(_moneda) THEN RAISE EXCEPTION 'Moneda del cobro distinta'; END IF;
    IF COALESCE(m.amount, 0) < _monto THEN RAISE EXCEPTION 'El cobro no alcanza el importe de la reserva'; END IF;
    IF m.external_reference IS NOT NULL AND m.external_reference LIKE 'turnera:%'
       AND m.external_reference <> 'turnera:' || r.id::text THEN
      RAISE EXCEPTION 'El cobro corresponde a otra reserva de turnera';
    END IF;
    IF m.suscripcion_id IS NOT NULL OR m.reservation_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'El cobro ya está vinculado a otra obligación: requiere revisión manual, no se modificó nada';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pagos_imputaciones pi WHERE pi.pago_origen_id = m.id AND pi.anulado_at IS NULL) THEN
      RAISE EXCEPTION 'El cobro ya tiene imputaciones: riesgo de doble haber, no se modificó nada';
    END IF;
    IF EXISTS (SELECT 1 FROM public.reservas_turnera o WHERE o.pago_mp_payment_id = v_mp AND o.id <> r.id) THEN
      RAISE EXCEPTION 'El cobro ya está aplicado a otra reserva de turnera';
    END IF;
  END IF;

  IF COALESCE(r.estado_economico,'') = 'pagado' OR COALESCE(r.pago_estado,'') = 'aprobado' THEN
    RAISE EXCEPTION 'La reserva ya figura pagada: no se registra un segundo pago';
  END IF;

  -- El trigger sync_turnera_cuenta_corriente crea el único crédito de la reserva.
  UPDATE public.reservas_turnera SET
    pago_estado = 'aprobado', estado_economico = 'pagado', pago_monto = _monto,
    metodo_pago = COALESCE(NULLIF(_metodo, ''), CASE WHEN _mp_movement_id IS NULL THEN 'otro' ELSE 'mercadopago' END),
    pago_mp_payment_id = COALESCE(v_mp, pago_mp_payment_id),
    hold_expira_at = NULL, verificado_por = auth.uid(), verificado_at = now()
  WHERE id = r.id;

  IF _mp_movement_id IS NOT NULL AND m.alumno_id IS NULL THEN
    UPDATE public.mp_account_movements SET alumno_id = r.alumno_id WHERE id = _mp_movement_id;
  END IF;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'turnera_pago_registrado', 'reservas_turnera', r.id,
          jsonb_build_object('monto', _monto, 'moneda', _moneda, 'mp_movement_id', _mp_movement_id));
  RETURN jsonb_build_object('ok', true, 'duplicate', false);
END $$;
REVOKE ALL ON FUNCTION public.admin_register_turnera_payment(uuid, numeric, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_register_turnera_payment(uuid, numeric, text, text, uuid, uuid) TO authenticated;

-- 3) Un cobro con external_reference 'turnera:<id>' no puede quedar NUEVAMENTE vinculado a una mensualidad.
--    Los 14 vínculos históricos existentes se conservan para revisión manual (solo se bloquean cambios nuevos).
CREATE OR REPLACE FUNCTION public.guard_turnera_mp_not_subscription()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.external_reference LIKE 'turnera:%' AND NEW.suscripcion_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.suscripcion_id IS DISTINCT FROM OLD.suscripcion_id) THEN
    RAISE EXCEPTION 'Cobro de clase eventual (turnera): no puede imputarse a una mensualidad';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_turnera_mp_not_subscription ON public.mp_account_movements;
CREATE TRIGGER trg_guard_turnera_mp_not_subscription
  BEFORE INSERT OR UPDATE OF suscripcion_id ON public.mp_account_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_turnera_mp_not_subscription();
