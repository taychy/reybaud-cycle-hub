
-- 1) Targets: agrega cargos pendientes de cuenta corriente
CREATE OR REPLACE FUNCTION public.get_alumno_payment_targets(_alumno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reservations jsonb;
  v_subs jsonb;
  v_cargos jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha' DESC), '[]'::jsonb) INTO v_reservations
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'label', COALESCE(e.title, 'Evento'),
      'currency', COALESCE(r.currency_snapshot, e.currency, 'ARS'),
      'total', COALESCE(r.amount_total, 0),
      'paid', COALESCE(r.amount_paid, 0),
      'balance', COALESCE(r.balance_due, 0),
      'fecha', COALESCE(e.start_date::text, r.created_at::date::text)
    ) AS x
    FROM public.event_reservations r
    LEFT JOIN public.events e ON e.id = r.event_id
    WHERE r.alumno_id = _alumno_id
      AND COALESCE(r.estado, '') NOT IN ('cancelada', 'cancelado', 'rechazada', 'expirada')
      AND COALESCE(r.balance_due, 0) > 0
  ) s;

  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'fecha' DESC), '[]'::jsonb) INTO v_subs
  FROM (
    SELECT jsonb_build_object(
      'id', su.id,
      'label', COALESCE(p.nombre, 'Plan'),
      'currency', COALESCE(p.moneda, 'ARS'),
      'total', COALESCE(su.precio_final, su.precio_base, 0),
      'estado', su.estado,
      'fecha', su.fecha_inicio::text
    ) AS y
    FROM public.suscripciones su
    LEFT JOIN public.planes p ON p.id = su.plan_id
    WHERE su.alumno_id = _alumno_id
      AND su.estado IN ('pendiente', 'pendiente_verificacion', 'vencida', 'activa')
      AND COALESCE(su.mp_status, '') <> 'approved'
      AND su.mp_payment_id IS NULL
  ) s2;

  SELECT COALESCE(jsonb_agg(z ORDER BY z->>'fecha' DESC), '[]'::jsonb) INTO v_cargos
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'label', COALESCE(NULLIF(c.concepto, ''), 'Cargo en cuenta corriente'),
      'currency', COALESCE(c.moneda, 'ARS'),
      'total', c.monto,
      'paid', COALESCE(ap.aplicado, 0),
      'balance', c.monto - COALESCE(ap.aplicado, 0),
      'fecha', c.fecha::text
    ) AS z
    FROM public.cuenta_ajustes c
    LEFT JOIN LATERAL (
      SELECT SUM(cr.monto) AS aplicado
      FROM public.cuenta_ajustes cr
      WHERE cr.tipo = 'credito'
        AND cr.aplicado_a_fuente_tabla = 'cuenta_ajustes'
        AND cr.aplicado_a_fuente_id = c.id
    ) ap ON true
    WHERE c.alumno_id = _alumno_id
      AND c.tipo = 'cargo'
      AND c.monto - COALESCE(ap.aplicado, 0) > 0.01
  ) s3;

  RETURN jsonb_build_object('reservations', v_reservations, 'subscriptions', v_subs, 'cargos', v_cargos);
END;
$function$;

-- 2) Asignación de movimiento MP a un cargo de cuenta corriente
CREATE OR REPLACE FUNCTION public.assign_mp_movement_to_target(_movement_id uuid, _alumno_id uuid, _target_type text, _target_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
  v_res record;
  v_cargo record;
  v_event_currency text;
  v_payment_id uuid;
  v_existing uuid;
  v_credit_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _target_type = 'saldo' THEN
    RETURN public.assign_mp_movement_to_alumno(_movement_id, _alumno_id, _notes);
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
  IF v_mov.alumno_id IS NOT NULL AND v_mov.alumno_id <> _alumno_id THEN
    RAISE EXCEPTION 'already_assigned_to_other_student';
  END IF;
  IF v_mov.direccion IS DISTINCT FROM 'ingreso' THEN RAISE EXCEPTION 'only_income_movements_can_be_assigned'; END IF;
  IF v_mov.status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'only_approved_movements_can_be_assigned'; END IF;

  UPDATE public.mp_account_movements SET
    alumno_id = _alumno_id,
    assigned_manually = true,
    assigned_by = auth.uid(),
    assigned_at = now(),
    assign_notes = _notes
  WHERE id = _movement_id;

  IF _target_type = 'reservation' THEN
    SELECT r.*, COALESCE(r.currency_snapshot, e.currency, 'ARS') AS ev_currency
      INTO v_res
      FROM public.event_reservations r
      LEFT JOIN public.events e ON e.id = r.event_id
     WHERE r.id = _target_id
     FOR UPDATE OF r;
    IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
    v_event_currency := v_res.ev_currency;

    SELECT id INTO v_existing
      FROM public.reservation_payments
     WHERE reservation_id = _target_id
       AND anulado_at IS NULL
       AND (mp_payment_id = v_mov.mp_payment_id OR payment_reference = v_mov.mp_payment_id)
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.mp_account_movements SET reservation_payment_id = v_existing WHERE id = _movement_id;
      RETURN jsonb_build_object('created', false, 'payment_id', v_existing, 'skipped_reason', 'payment_already_linked');
    END IF;

    INSERT INTO public.reservation_payments (
      reservation_id, alumno_id, amount, currency, payment_date, payment_method,
      payment_reference, notes, status, reviewed_at, reviewed_by,
      original_amount, original_currency, event_currency,
      equivalent_amount_event_currency, cuenta_mp_id, mp_payment_id
    ) VALUES (
      _target_id, _alumno_id, ROUND(v_mov.amount::numeric, 2), COALESCE(v_mov.currency, 'ARS'),
      (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      'mercadopago', v_mov.mp_payment_id,
      COALESCE(_notes, 'Aplicado desde movimientos MP. Op ' || v_mov.mp_payment_id),
      'validado', now(), auth.uid(),
      ROUND(v_mov.amount::numeric, 2), COALESCE(v_mov.currency, 'ARS'), v_event_currency,
      CASE WHEN COALESCE(v_mov.currency, 'ARS') = v_event_currency THEN ROUND(v_mov.amount::numeric, 2) END,
      v_mov.cuenta_mp_id, v_mov.mp_payment_id
    ) RETURNING id INTO v_payment_id;

    UPDATE public.mp_account_movements SET reservation_payment_id = v_payment_id WHERE id = _movement_id;
    PERFORM public.recalculate_reservation_payment_totals(_target_id);

    RETURN jsonb_build_object('created', true, 'payment_id', v_payment_id, 'target', 'reservation');

  ELSIF _target_type = 'suscripcion' THEN
    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones SET
      mp_payment_id = v_mov.mp_payment_id,
      mp_status = 'approved',
      metodo_pago = COALESCE(metodo_pago, 'mercadopago'),
      cuenta_mp_id = COALESCE(cuenta_mp_id, v_mov.cuenta_mp_id),
      estado = CASE WHEN estado IN ('pendiente', 'pendiente_verificacion', 'vencida') THEN 'activa' ELSE estado END,
      notas = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE E'\n' END
              || 'Pago MP aplicado manualmente. Op ' || COALESCE(v_mov.mp_payment_id, '-'),
      updated_at = now()
    WHERE id = _target_id AND alumno_id = _alumno_id;
    PERFORM set_config('app.sub_internal', 'off', true);

    IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

    UPDATE public.mp_account_movements SET suscripcion_id = _target_id WHERE id = _movement_id;
    RETURN jsonb_build_object('created', true, 'target', 'suscripcion');

  ELSIF _target_type = 'cargo' THEN
    SELECT * INTO v_cargo FROM public.cuenta_ajustes WHERE id = _target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cargo_not_found'; END IF;
    IF v_cargo.tipo <> 'cargo' THEN RAISE EXCEPTION 'target_is_not_a_charge'; END IF;
    IF v_cargo.alumno_id <> _alumno_id THEN RAISE EXCEPTION 'charge_of_other_student'; END IF;

    SELECT id INTO v_existing
      FROM public.cuenta_ajustes
     WHERE tipo = 'credito'
       AND alumno_id = _alumno_id
       AND referencia_externa IS NOT NULL
       AND referencia_externa = v_mov.mp_payment_id
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.cuenta_ajustes
         SET aplicado_a_fuente_tabla = 'cuenta_ajustes',
             aplicado_a_fuente_id = _target_id,
             updated_at = now()
       WHERE id = v_existing;
      RETURN jsonb_build_object('created', false, 'ajuste_id', v_existing, 'target', 'cargo');
    END IF;

    INSERT INTO public.cuenta_ajustes (
      alumno_id, tipo, concepto, monto, moneda, fecha, notas, created_by,
      medio_pago, cuenta_mp_id, referencia_externa,
      aplicado_a_fuente_tabla, aplicado_a_fuente_id
    ) VALUES (
      _alumno_id, 'credito',
      'Pago Mercado Pago aplicado a: ' || COALESCE(NULLIF(v_cargo.concepto, ''), 'cargo en cuenta corriente'),
      ROUND(v_mov.amount::numeric, 2), COALESCE(v_mov.currency, 'ARS'),
      (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      COALESCE(_notes, 'Op ' || COALESCE(v_mov.mp_payment_id, '-')), auth.uid(),
      'mercadopago', v_mov.cuenta_mp_id, v_mov.mp_payment_id,
      'cuenta_ajustes', _target_id
    ) RETURNING id INTO v_credit_id;

    RETURN jsonb_build_object('created', true, 'ajuste_id', v_credit_id, 'target', 'cargo');
  END IF;

  RAISE EXCEPTION 'invalid_target_type';
END;
$function$;

-- 3) Aplicar un saldo a favor existente a cualquier deuda
CREATE OR REPLACE FUNCTION public.apply_credit_ajuste_to_target(_ajuste_id uuid, _target_type text, _target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aj record;
  v_res record;
  v_cargo record;
  v_event_currency text;
  v_payment_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _target_type = 'suscripcion' THEN
    RETURN public.apply_credit_ajuste_to_suscripcion(_ajuste_id, _target_id);
  END IF;

  SELECT * INTO v_aj FROM public.cuenta_ajustes WHERE id = _ajuste_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ajuste_not_found'; END IF;
  IF v_aj.tipo <> 'credito' THEN RAISE EXCEPTION 'only_credit_can_be_applied'; END IF;
  IF v_aj.aplicado_a_fuente_id IS NOT NULL THEN RAISE EXCEPTION 'credit_already_applied'; END IF;

  IF _target_type = 'reservation' THEN
    SELECT r.*, COALESCE(r.currency_snapshot, e.currency, 'ARS') AS ev_currency
      INTO v_res
      FROM public.event_reservations r
      LEFT JOIN public.events e ON e.id = r.event_id
     WHERE r.id = _target_id
     FOR UPDATE OF r;
    IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
    IF v_res.alumno_id IS DISTINCT FROM v_aj.alumno_id THEN RAISE EXCEPTION 'reservation_of_other_student'; END IF;
    v_event_currency := v_res.ev_currency;

    INSERT INTO public.reservation_payments (
      reservation_id, alumno_id, amount, currency, payment_date, payment_method,
      payment_reference, notes, status, reviewed_at, reviewed_by,
      original_amount, original_currency, event_currency,
      equivalent_amount_event_currency, cuenta_mp_id, mp_payment_id
    ) VALUES (
      _target_id, v_aj.alumno_id, ROUND(v_aj.monto::numeric, 2), COALESCE(v_aj.moneda, 'ARS'),
      COALESCE(v_aj.fecha, CURRENT_DATE),
      COALESCE(v_aj.medio_pago, 'saldo_a_favor'), v_aj.referencia_externa,
      'Aplicado desde saldo a favor (ajuste ' || _ajuste_id::text || ')',
      'validado', now(), auth.uid(),
      ROUND(v_aj.monto::numeric, 2), COALESCE(v_aj.moneda, 'ARS'), v_event_currency,
      CASE WHEN COALESCE(v_aj.moneda, 'ARS') = v_event_currency THEN ROUND(v_aj.monto::numeric, 2) END,
      v_aj.cuenta_mp_id, v_aj.referencia_externa
    ) RETURNING id INTO v_payment_id;

    UPDATE public.cuenta_ajustes SET
      aplicado_a_fuente_tabla = 'event_reservations',
      aplicado_a_fuente_id = _target_id,
      updated_at = now()
    WHERE id = _ajuste_id;

    UPDATE public.mp_account_movements
       SET reservation_payment_id = v_payment_id
     WHERE v_aj.referencia_externa IS NOT NULL
       AND mp_payment_id = v_aj.referencia_externa
       AND reservation_payment_id IS NULL;

    PERFORM public.recalculate_reservation_payment_totals(_target_id);

    RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'target', 'reservation');

  ELSIF _target_type = 'cargo' THEN
    SELECT * INTO v_cargo FROM public.cuenta_ajustes WHERE id = _target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cargo_not_found'; END IF;
    IF v_cargo.tipo <> 'cargo' THEN RAISE EXCEPTION 'target_is_not_a_charge'; END IF;
    IF v_cargo.alumno_id <> v_aj.alumno_id THEN RAISE EXCEPTION 'charge_of_other_student'; END IF;

    UPDATE public.cuenta_ajustes SET
      aplicado_a_fuente_tabla = 'cuenta_ajustes',
      aplicado_a_fuente_id = _target_id,
      updated_at = now()
    WHERE id = _ajuste_id;

    RETURN jsonb_build_object('ok', true, 'target', 'cargo', 'cargo_id', _target_id);
  END IF;

  RAISE EXCEPTION 'invalid_target_type';
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_credit_ajuste_to_target(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_credit_ajuste_to_target(uuid, text, uuid) TO authenticated;
