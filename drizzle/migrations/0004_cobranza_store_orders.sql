-- 1) Aplicar un crédito de cuenta corriente a un pedido de tienda
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
  v_order record;
  v_event_currency text;
  v_payment_id uuid;
  v_patch_status text;
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

  ELSIF _target_type = 'store_order' THEN
    SELECT * INTO v_order FROM public.store_orders WHERE id = _target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'store_order_not_found'; END IF;
    IF v_order.alumno_id IS DISTINCT FROM v_aj.alumno_id THEN RAISE EXCEPTION 'store_order_of_other_student'; END IF;
    IF v_order.cancelled_at IS NOT NULL OR COALESCE(v_order.status,'') IN ('cancelado','cancelada') THEN
      RAISE EXCEPTION 'store_order_cancelled';
    END IF;
    IF v_order.pagado_at IS NOT NULL THEN RAISE EXCEPTION 'store_order_already_paid'; END IF;
    IF COALESCE(v_order.currency,'ARS') <> COALESCE(v_aj.moneda,'ARS') THEN RAISE EXCEPTION 'currency_mismatch'; END IF;

    UPDATE public.cuenta_ajustes SET
      aplicado_a_fuente_tabla = 'store_orders',
      aplicado_a_fuente_id = _target_id,
      updated_at = now()
    WHERE id = _ajuste_id;

    -- Sólo se da por cobrado cuando el monto cubre el total del pedido.
    IF ROUND(v_aj.monto::numeric, 2) + 0.01 >= ROUND(COALESCE(v_order.total, 0)::numeric, 2) THEN
      v_patch_status := CASE
        WHEN COALESCE(v_order.status,'') IN ('pendiente','pendiente_pago','pendiente_pago_efectivo','pagado')
          THEN 'pagado' ELSE v_order.status END;
      UPDATE public.store_orders SET
        pagado_at = COALESCE(v_aj.fecha::timestamptz, now()),
        metodo_pago = COALESCE(v_aj.medio_pago, metodo_pago),
        status = v_patch_status,
        updated_at = now()
      WHERE id = _target_id;
      RETURN jsonb_build_object('ok', true, 'target', 'store_order', 'store_order_id', _target_id, 'paid', true);
    END IF;

    RETURN jsonb_build_object('ok', true, 'target', 'store_order', 'store_order_id', _target_id, 'paid', false);

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

-- 2) Evitar doble movimiento: si el pedido se cobró vía crédito de cuenta
--    corriente, el haber lo aporta ese cobro y no el pago_tienda del pedido.
DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass, true);
  v_new := replace(
    v_def,
    'so.alumno_id IS NOT NULL AND (so.pagado_at IS NOT NULL',
    'so.alumno_id IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM cuenta_ajustes ca2 WHERE ca2.tipo = ''credito'' AND ca2.aplicado_a_fuente_tabla = ''store_orders'' AND ca2.aplicado_a_fuente_id = so.id)) AND (so.pagado_at IS NOT NULL'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'pago_tienda predicate not found in view definition';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS ' || v_new;
END $mig$;
