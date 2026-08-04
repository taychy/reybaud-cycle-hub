CREATE OR REPLACE FUNCTION public.split_mp_movement_among_alumnos(
  _movement_id uuid,
  _splits jsonb,
  _notes text DEFAULT NULL
)
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

    SELECT id INTO v_existing
      FROM public.cuenta_ajustes
     WHERE referencia_externa = v_mov.mp_payment_id
       AND alumno_id = v_alumno_id
       AND tipo = 'credito'
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_res := v_res || jsonb_build_object('alumno_id', v_alumno_id, 'ajuste_id', v_existing, 'created', false);
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

    v_created := v_created + 1;
    v_res := v_res || jsonb_build_object('alumno_id', v_alumno_id, 'ajuste_id', v_ajuste_id, 'created', true);
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

GRANT EXECUTE ON FUNCTION public.split_mp_movement_among_alumnos(uuid, jsonb, text) TO authenticated;