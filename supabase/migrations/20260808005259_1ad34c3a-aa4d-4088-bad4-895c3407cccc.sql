
-- 1) Chequeo central: ¿este pago MP ya está registrado para este alumno?
CREATE OR REPLACE FUNCTION public.fn_mp_pago_ya_registrado(_alumno_id uuid, _mp_payment_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _mp_payment_id IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.suscripciones s
     WHERE s.alumno_id = _alumno_id AND s.mp_payment_id = _mp_payment_id
    UNION ALL
    SELECT 1 FROM public.cuenta_ajustes ca
     WHERE ca.alumno_id = _alumno_id AND ca.tipo = 'credito'
       AND ca.referencia_externa = _mp_payment_id
    UNION ALL
    SELECT 1 FROM public.reservation_payments rp
     WHERE rp.alumno_id = _alumno_id AND rp.anulado_at IS NULL
       AND (rp.mp_payment_id = _mp_payment_id OR rp.payment_reference = _mp_payment_id)
  ) END;
$function$;

-- 2) Helper: imputar un crédito existente a una suscripción respetando la convención
--    (la suscripción saldada por crédito debe quedar en metodo_pago = 'saldo_a_favor')
CREATE OR REPLACE FUNCTION public.fn_imputar_credito_a_suscripcion(_ajuste_id uuid, _suscripcion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aj record;
  v_sub record;
BEGIN
  SELECT * INTO v_aj FROM public.cuenta_ajustes WHERE id = _ajuste_id FOR UPDATE;
  IF NOT FOUND OR v_aj.tipo <> 'credito' THEN RAISE EXCEPTION 'credit_not_found'; END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = _suscripcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  IF v_sub.alumno_id <> v_aj.alumno_id THEN RAISE EXCEPTION 'subscription_of_other_student'; END IF;

  UPDATE public.cuenta_ajustes
     SET aplicado_a_fuente_tabla = 'suscripciones',
         aplicado_a_fuente_id = _suscripcion_id,
         updated_at = now()
   WHERE id = _ajuste_id;

  PERFORM set_config('app.sub_internal', 'on', true);
  UPDATE public.suscripciones SET
    metodo_pago = 'saldo_a_favor',
    mp_status = 'approved',
    mp_payment_id = COALESCE(mp_payment_id, v_aj.referencia_externa),
    cuenta_mp_id = COALESCE(cuenta_mp_id, v_aj.cuenta_mp_id),
    estado = CASE WHEN estado IN ('pendiente','pendiente_verificacion','vencida') THEN 'activa' ELSE estado END,
    updated_at = now()
  WHERE id = _suscripcion_id;
  PERFORM set_config('app.sub_internal', 'off', true);
END;
$function$;

-- 3) Split familiar con imputación opcional por integrante
CREATE OR REPLACE FUNCTION public.split_mp_movement_among_alumnos(_movement_id uuid, _splits jsonb, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
  v_item jsonb;
  v_alumno_id uuid;
  v_monto numeric;
  v_total numeric := 0;
  v_payer uuid;
  v_created int := 0;
  v_existing uuid;
  v_ajuste_id uuid;
  v_target_type text;
  v_target_id uuid;
  v_res jsonb := '[]'::jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
  IF v_mov.direccion IS DISTINCT FROM 'ingreso' THEN RAISE EXCEPTION 'only_income_movements_can_be_assigned'; END IF;
  IF v_mov.status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'only_approved_movements_can_be_assigned'; END IF;

  IF jsonb_typeof(_splits) <> 'array' OR jsonb_array_length(_splits) < 1 THEN
    RAISE EXCEPTION 'invalid_splits';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_splits) LOOP
    v_monto := ROUND(COALESCE((v_item->>'monto')::numeric, 0), 2);
    IF v_monto <= 0 THEN RAISE EXCEPTION 'invalid_split_amount'; END IF;
    v_total := v_total + v_monto;
  END LOOP;

  IF v_total > ROUND(v_mov.amount::numeric, 2) + 0.01 THEN
    RAISE EXCEPTION 'splits_exceed_movement_amount';
  END IF;

  v_payer := ((_splits->0)->>'alumno_id')::uuid;

  IF v_mov.alumno_id IS NOT NULL AND v_mov.alumno_id <> v_payer THEN
    RAISE EXCEPTION 'already_assigned_to_other_student';
  END IF;

  UPDATE public.mp_account_movements SET
    alumno_id = v_payer,
    assigned_manually = true,
    assigned_by = auth.uid(),
    assigned_at = now(),
    assign_notes = COALESCE(_notes, 'Pago familiar dividido entre ' || jsonb_array_length(_splits) || ' alumnos')
  WHERE id = _movement_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_splits) LOOP
    v_alumno_id := (v_item->>'alumno_id')::uuid;
    v_monto := ROUND((v_item->>'monto')::numeric, 2);
    v_target_type := NULLIF(v_item->>'target_type', '');
    v_target_id := NULLIF(v_item->>'target_id', '')::uuid;
    v_existing := NULL;

    SELECT id INTO v_existing
      FROM public.cuenta_ajustes
     WHERE referencia_externa = v_mov.mp_payment_id
       AND alumno_id = v_alumno_id
       AND tipo = 'credito'
       AND ROUND(monto, 2) = v_monto
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      IF v_target_type = 'suscripcion' AND v_target_id IS NOT NULL THEN
        PERFORM public.fn_imputar_credito_a_suscripcion(v_existing, v_target_id);
      END IF;
      v_res := v_res || jsonb_build_object('alumno_id', v_alumno_id, 'ajuste_id', v_existing, 'created', false, 'reason', 'credit_already_exists');
      CONTINUE;
    END IF;

    -- Blindaje: si no se indicó destino y el pago ya está registrado para el alumno, no duplicar
    IF v_target_id IS NULL AND public.fn_mp_pago_ya_registrado(v_alumno_id, v_mov.mp_payment_id) THEN
      v_res := v_res || jsonb_build_object('alumno_id', v_alumno_id, 'ajuste_id', NULL, 'created', false, 'reason', 'already_registered');
      CONTINUE;
    END IF;

    INSERT INTO public.cuenta_ajustes (
      alumno_id, tipo, concepto, monto, moneda, fecha, medio_pago, cuenta_mp_id,
      referencia_externa, notas, created_by
    ) VALUES (
      v_alumno_id,
      'credito',
      'Pago Mercado Pago (pago familiar dividido)',
      v_monto,
      COALESCE(v_mov.currency, 'ARS'),
      (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      'mercadopago',
      v_mov.cuenta_mp_id,
      v_mov.mp_payment_id,
      COALESCE(_notes, 'Parte de un pago familiar. Op ' || COALESCE(v_mov.mp_payment_id, '—')),
      auth.uid()
    ) RETURNING id INTO v_ajuste_id;

    IF v_target_type = 'suscripcion' AND v_target_id IS NOT NULL THEN
      PERFORM public.fn_imputar_credito_a_suscripcion(v_ajuste_id, v_target_id);
    END IF;

    v_created := v_created + 1;
    v_res := v_res || jsonb_build_object('alumno_id', v_alumno_id, 'ajuste_id', v_ajuste_id, 'created', true, 'imputado_a', v_target_id);
  END LOOP;

  RETURN jsonb_build_object(
    'movement_id', _movement_id,
    'created', v_created,
    'total_asignado', v_total,
    'restante', ROUND(v_mov.amount::numeric, 2) - v_total,
    'detalle', v_res
  );
END;
$function$;

-- 4) Asignación directa a saldo: usar el chequeo central
CREATE OR REPLACE FUNCTION public.assign_mp_movement_to_alumno(_movement_id uuid, _alumno_id uuid, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
  v_ajuste_id uuid;
  v_existing_ajuste uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;

  IF v_mov.alumno_id IS NOT NULL AND v_mov.alumno_id <> _alumno_id THEN
    RAISE EXCEPTION 'already_assigned_to_other_student';
  END IF;
  IF v_mov.direccion IS DISTINCT FROM 'ingreso' THEN
    RAISE EXCEPTION 'only_income_movements_can_be_assigned';
  END IF;
  IF v_mov.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'only_approved_movements_can_be_assigned';
  END IF;

  UPDATE public.mp_account_movements SET
    alumno_id = _alumno_id,
    assigned_manually = true,
    assigned_by = auth.uid(),
    assigned_at = now(),
    assign_notes = _notes
  WHERE id = _movement_id;

  SELECT id INTO v_existing_ajuste
    FROM public.cuenta_ajustes
   WHERE referencia_externa = v_mov.mp_payment_id
     AND alumno_id = _alumno_id
     AND tipo = 'credito'
   LIMIT 1;

  IF v_existing_ajuste IS NOT NULL THEN
    RETURN jsonb_build_object('movement_id', _movement_id, 'ajuste_id', v_existing_ajuste, 'created', false);
  END IF;

  IF v_mov.suscripcion_id IS NOT NULL
     OR public.fn_mp_pago_ya_registrado(_alumno_id, v_mov.mp_payment_id)
     OR EXISTS (SELECT 1 FROM public.store_orders so WHERE so.mp_payment_id = v_mov.mp_payment_id)
     OR EXISTS (SELECT 1 FROM public.store_preorders sp WHERE sp.mp_payment_id = v_mov.mp_payment_id)
  THEN
    RETURN jsonb_build_object('movement_id', _movement_id, 'ajuste_id', NULL, 'created', false, 'skipped_reason', 'already_registered');
  END IF;

  INSERT INTO public.cuenta_ajustes (
    alumno_id, tipo, concepto, monto, moneda, fecha, medio_pago, cuenta_mp_id,
    referencia_externa, notas, created_by
  ) VALUES (
    _alumno_id, 'credito', 'Pago Mercado Pago (asignado al alumno)',
    ROUND(v_mov.amount::numeric, 2), COALESCE(v_mov.currency, 'ARS'),
    (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    'mercadopago', v_mov.cuenta_mp_id, v_mov.mp_payment_id,
    COALESCE(_notes, 'Asignado desde movimientos MP. Op ' || v_mov.mp_payment_id),
    auth.uid()
  ) RETURNING id INTO v_ajuste_id;

  RETURN jsonb_build_object('movement_id', _movement_id, 'ajuste_id', v_ajuste_id, 'created', true);
END;
$function$;
