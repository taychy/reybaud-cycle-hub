
-- RPC: asignar un movimiento MP a un alumno como saldo a favor.
-- Bloquea reasignación si ya está asignado a otro alumno.
-- Crea automáticamente un crédito en cuenta_ajustes (saldo a favor) vinculado al mp_payment_id,
-- para que aparezca en la cuenta corriente del alumno.

CREATE OR REPLACE FUNCTION public.assign_mp_movement_to_alumno(
  _movement_id uuid,
  _alumno_id uuid,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov record;
  v_ajuste_id uuid;
  v_existing_ajuste uuid;
BEGIN
  -- Solo admins/super admins
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'movement_not_found';
  END IF;

  -- Bloquear reasignación
  IF v_mov.alumno_id IS NOT NULL AND v_mov.alumno_id <> _alumno_id THEN
    RAISE EXCEPTION 'already_assigned_to_other_student';
  END IF;

  -- Solo ingresos aprobados
  IF v_mov.direccion IS DISTINCT FROM 'ingreso' THEN
    RAISE EXCEPTION 'only_income_movements_can_be_assigned';
  END IF;
  IF v_mov.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'only_approved_movements_can_be_assigned';
  END IF;

  -- Actualizar movimiento
  UPDATE public.mp_account_movements SET
    alumno_id = _alumno_id,
    assigned_manually = true,
    assigned_by = auth.uid(),
    assigned_at = now(),
    assign_notes = _notes
  WHERE id = _movement_id;

  -- Idempotencia: si ya existe un ajuste ligado a este mp_payment_id, no duplicar
  SELECT id INTO v_existing_ajuste
    FROM public.cuenta_ajustes
    WHERE referencia_externa = v_mov.mp_payment_id
      AND alumno_id = _alumno_id
      AND tipo = 'credito'
    LIMIT 1;

  IF v_existing_ajuste IS NOT NULL THEN
    RETURN jsonb_build_object('movement_id', _movement_id, 'ajuste_id', v_existing_ajuste, 'created', false);
  END IF;

  -- Crear crédito (saldo a favor)
  INSERT INTO public.cuenta_ajustes (
    alumno_id, tipo, concepto, monto, moneda, fecha, medio_pago, cuenta_mp_id,
    referencia_externa, notas, created_by
  ) VALUES (
    _alumno_id,
    'credito',
    'Pago MP sin conciliar (asignado manualmente)',
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
$$;

GRANT EXECUTE ON FUNCTION public.assign_mp_movement_to_alumno(uuid, uuid, text) TO authenticated;


-- RPC: quitar la asignación. Solo permitido si el crédito NO fue aún aplicado a una deuda.
CREATE OR REPLACE FUNCTION public.unassign_mp_movement(
  _movement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov record;
  v_applied_count int;
  v_deleted int := 0;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'movement_not_found';
  END IF;

  IF v_mov.alumno_id IS NULL THEN
    RETURN jsonb_build_object('movement_id', _movement_id, 'unassigned', false);
  END IF;

  -- Si el crédito ya fue aplicado a alguna deuda, bloquear
  SELECT count(*) INTO v_applied_count
    FROM public.cuenta_ajustes
    WHERE referencia_externa = v_mov.mp_payment_id
      AND alumno_id = v_mov.alumno_id
      AND tipo = 'credito'
      AND aplicado_a_fuente_id IS NOT NULL;

  IF v_applied_count > 0 THEN
    RAISE EXCEPTION 'credit_already_applied_cannot_unassign';
  END IF;

  DELETE FROM public.cuenta_ajustes
    WHERE referencia_externa = v_mov.mp_payment_id
      AND alumno_id = v_mov.alumno_id
      AND tipo = 'credito'
      AND aplicado_a_fuente_id IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.mp_account_movements SET
    alumno_id = NULL,
    assigned_manually = false,
    assigned_by = NULL,
    assigned_at = NULL,
    assign_notes = NULL
  WHERE id = _movement_id;

  RETURN jsonb_build_object('movement_id', _movement_id, 'unassigned', true, 'ajustes_borrados', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unassign_mp_movement(uuid) TO authenticated;
