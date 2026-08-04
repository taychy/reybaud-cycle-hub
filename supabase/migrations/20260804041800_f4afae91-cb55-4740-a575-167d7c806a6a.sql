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
  v_already_registered boolean := false;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'movement_not_found';
  END IF;

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

  IF v_mov.mp_payment_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.reservation_payments rp
       WHERE rp.anulado_at IS NULL
         AND (rp.mp_payment_id = v_mov.mp_payment_id OR rp.payment_reference = v_mov.mp_payment_id)
      UNION ALL
      SELECT 1 FROM public.suscripciones s
       WHERE s.mp_payment_id = v_mov.mp_payment_id
      UNION ALL
      SELECT 1 FROM public.store_orders so
       WHERE so.mp_payment_id = v_mov.mp_payment_id
      UNION ALL
      SELECT 1 FROM public.store_preorders sp
       WHERE sp.mp_payment_id = v_mov.mp_payment_id
    ) INTO v_already_registered;
  END IF;

  IF v_mov.suscripcion_id IS NOT NULL THEN
    v_already_registered := true;
  END IF;

  IF v_already_registered THEN
    RETURN jsonb_build_object('movement_id', _movement_id, 'ajuste_id', NULL, 'created', false, 'skipped_reason', 'already_registered');
  END IF;

  INSERT INTO public.cuenta_ajustes (
    alumno_id, tipo, concepto, monto, moneda, fecha, medio_pago, cuenta_mp_id,
    referencia_externa, notas, created_by
  ) VALUES (
    _alumno_id,
    'credito',
    'Pago Mercado Pago (asignado al alumno)',
    ROUND(v_mov.amount::numeric, 2),
    COALESCE(v_mov.currency, 'ARS'),
    (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    'mercadopago',
    v_mov.cuenta_mp_id,
    v_mov.mp_payment_id,
    COALESCE(_notes, 'Asignado desde movimientos MP. Op ' || v_mov.mp_payment_id),
    auth.uid()
  ) RETURNING id INTO v_ajuste_id;

  RETURN jsonb_build_object('movement_id', _movement_id, 'ajuste_id', v_ajuste_id, 'created', true);
END;
$function$;