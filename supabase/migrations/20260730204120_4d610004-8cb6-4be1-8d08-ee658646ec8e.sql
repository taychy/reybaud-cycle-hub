CREATE OR REPLACE FUNCTION public.get_alumno_payment_targets(_alumno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservations jsonb;
  v_subs jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha' DESC), '[]'::jsonb) INTO v_reservations
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'label', COALESCE(e.nombre, 'Evento'),
      'currency', COALESCE(r.currency_snapshot, e.currency, 'ARS'),
      'total', COALESCE(r.amount_total, 0),
      'paid', COALESCE(r.amount_paid, 0),
      'balance', COALESCE(r.balance_due, 0),
      'fecha', COALESCE(e.fecha_inicio::text, r.created_at::date::text)
    ) AS x
    FROM public.event_reservations r
    LEFT JOIN public.events e ON e.id = r.event_id
    WHERE r.alumno_id = _alumno_id
      AND COALESCE(r.status, '') NOT IN ('cancelada', 'cancelado', 'rechazada')
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

  RETURN jsonb_build_object('reservations', v_reservations, 'subscriptions', v_subs);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_alumno_payment_targets(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_mp_movement_to_target(
  _movement_id uuid,
  _alumno_id uuid,
  _target_type text,
  _target_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov record;
  v_res record;
  v_event_currency text;
  v_payment_id uuid;
  v_existing uuid;
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

    IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

    UPDATE public.mp_account_movements SET suscripcion_id = _target_id WHERE id = _movement_id;
    RETURN jsonb_build_object('created', true, 'target', 'suscripcion');
  END IF;

  RAISE EXCEPTION 'invalid_target_type';
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_mp_movement_to_target(uuid, uuid, text, uuid, text) TO authenticated;