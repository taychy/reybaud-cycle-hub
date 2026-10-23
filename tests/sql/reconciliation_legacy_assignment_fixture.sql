-- Exact hosted RPC definitions, executed only in isolated fixtures.
SET check_function_bodies=off;
CREATE TABLE public.audit_log(id uuid DEFAULT gen_random_uuid(),user_id uuid,user_email text,user_role text,action text,entity_type text,entity_id text,details jsonb);
CREATE OR REPLACE FUNCTION public.apply_credit_ajuste_to_suscripcion(_ajuste_id uuid, _suscripcion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aj record;
  v_sub record;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_aj FROM public.cuenta_ajustes WHERE id = _ajuste_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ajuste_not_found'; END IF;
  IF v_aj.tipo <> 'credito' THEN RAISE EXCEPTION 'only_credit_can_be_applied'; END IF;
  IF v_aj.aplicado_a_fuente_id IS NOT NULL THEN RAISE EXCEPTION 'credit_already_applied'; END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = _suscripcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  IF v_sub.alumno_id <> v_aj.alumno_id THEN RAISE EXCEPTION 'subscription_of_other_student'; END IF;
  IF COALESCE(v_sub.mp_status, '') = 'approved' THEN RAISE EXCEPTION 'subscription_already_paid'; END IF;

  PERFORM set_config('app.sub_internal', 'on', true);

  UPDATE public.suscripciones SET
    mp_payment_id  = COALESCE(mp_payment_id, v_aj.referencia_externa),
    mp_status      = 'approved',
    metodo_pago    = COALESCE(v_aj.medio_pago, metodo_pago, 'mercadopago'),
    cuenta_mp_id   = COALESCE(cuenta_mp_id, v_aj.cuenta_mp_id),
    estado         = CASE WHEN estado IN ('pendiente','pendiente_verificacion','vencida') THEN 'activa' ELSE estado END,
    notas          = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE E'\n' END
                     || 'Pago aplicado desde cuenta corriente (ajuste ' || _ajuste_id::text || ')',
    updated_at     = now()
  WHERE id = _suscripcion_id;

  PERFORM set_config('app.sub_internal', 'off', true);

  UPDATE public.cuenta_ajustes SET
    aplicado_a_fuente_tabla = 'suscripciones',
    aplicado_a_fuente_id    = _suscripcion_id,
    updated_at = now()
  WHERE id = _ajuste_id;

  UPDATE public.mp_account_movements
     SET suscripcion_id = _suscripcion_id
   WHERE v_aj.referencia_externa IS NOT NULL
     AND mp_payment_id = v_aj.referencia_externa
     AND suscripcion_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'suscripcion_id', _suscripcion_id, 'ajuste_id', _ajuste_id);
END;
$function$;
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
  v_note text;
  v_conflict uuid;
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

  -- Guarda: un movimiento no puede estar imputado a dos obligaciones distintas
  IF _target_type = 'suscripcion' AND v_mov.reservation_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'movement_already_imputed_to_reservation';
  END IF;
  IF _target_type = 'reservation' AND v_mov.suscripcion_id IS NOT NULL AND v_mov.suscripcion_id <> _target_id THEN
    RAISE EXCEPTION 'movement_already_imputed_to_subscription';
  END IF;
  IF _target_type = 'suscripcion' AND v_mov.suscripcion_id IS NOT NULL AND v_mov.suscripcion_id <> _target_id THEN
    RAISE EXCEPTION 'movement_already_imputed_to_other_subscription';
  END IF;

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
    -- Guarda: el mismo pago MP no puede quedar imputado a dos suscripciones
    SELECT id INTO v_conflict FROM public.suscripciones
     WHERE mp_payment_id = v_mov.mp_payment_id AND id <> _target_id AND cancelada_at IS NULL
     LIMIT 1;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'mp_payment_already_imputed_to_subscription %', v_conflict;
    END IF;

    v_note := 'Pago MP aplicado manualmente. Op ' || COALESCE(v_mov.mp_payment_id, '-');

    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones SET
      mp_payment_id = v_mov.mp_payment_id,
      mp_status = 'approved',
      metodo_pago = 'mercadopago',              -- explícito, sin COALESCE
      cuenta_mp_id = COALESCE(v_mov.cuenta_mp_id, cuenta_mp_id),
      estado = CASE WHEN estado IN ('pendiente', 'pendiente_verificacion', 'vencida') THEN 'activa' ELSE estado END,
      notas = CASE
                WHEN COALESCE(notas, '') LIKE '%' || v_note || '%' THEN notas
                ELSE COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE E'\n' END || v_note
              END,
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