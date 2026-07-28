-- 1) Fix role check
CREATE OR REPLACE FUNCTION public.mp_egreso_to_gasto(_movement_id uuid, _categoria text, _subcategoria text, _descripcion text, _proveedor text, _unidad_negocio text, _notas text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.mp_account_movements%ROWTYPE;
  new_gasto_id uuid;
  existing_gasto_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admins pueden categorizar egresos MP';
  END IF;

  SELECT * INTO m FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento MP no encontrado'; END IF;
  IF m.direccion <> 'egreso' THEN RAISE EXCEPTION 'Este movimiento no es un egreso'; END IF;
  IF m.gasto_id IS NOT NULL THEN RAISE EXCEPTION 'Ya fue categorizado como gasto'; END IF;

  SELECT id INTO existing_gasto_id FROM public.gastos WHERE mp_payment_id = m.mp_payment_id;
  IF existing_gasto_id IS NOT NULL THEN
    UPDATE public.mp_account_movements
       SET gasto_id = existing_gasto_id, categorizado_at = now(), categorizado_por = auth.uid()
     WHERE id = _movement_id;
    RETURN existing_gasto_id;
  END IF;

  INSERT INTO public.gastos (
    categoria, subcategoria, descripcion, monto, moneda, fecha,
    proveedor, notas, forma_pago, origen_registro, estado_conciliacion,
    mp_payment_id, mp_status, unidad_negocio, registrado_por
  ) VALUES (
    COALESCE(_categoria,'otros'),
    _subcategoria,
    COALESCE(NULLIF(_descripcion,''), 'Egreso MP ' || m.mp_payment_id),
    m.amount, m.currency, m.fecha_movimiento::date,
    _proveedor, _notas, 'mercado_pago', 'mp_egreso', 'conciliado',
    m.mp_payment_id, m.status, COALESCE(_unidad_negocio,'compartido'), auth.uid()
  ) RETURNING id INTO new_gasto_id;

  UPDATE public.mp_account_movements
     SET gasto_id = new_gasto_id, categorizado_at = now(), categorizado_por = auth.uid()
   WHERE id = _movement_id;

  RETURN new_gasto_id;
END;
$function$;

-- 2) Link MP egreso to a scheduled expense (catálogo/agenda)
CREATE OR REPLACE FUNCTION public.mp_egreso_to_ejecucion(_movement_id uuid, _ejecucion_id uuid, _notas text DEFAULT NULL, _es_excedente boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.mp_account_movements%ROWTYPE;
  v_ejec public.gastos_ejecuciones%ROWTYPE;
  v_rec public.gastos_recurrentes%ROWTYPE;
  v_gasto_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admins pueden vincular egresos MP';
  END IF;

  SELECT * INTO m FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento MP no encontrado'; END IF;
  IF m.direccion <> 'egreso' THEN RAISE EXCEPTION 'Este movimiento no es un egreso'; END IF;
  IF m.gasto_id IS NOT NULL THEN RAISE EXCEPTION 'Este movimiento ya fue vinculado'; END IF;

  SELECT * INTO v_ejec FROM public.gastos_ejecuciones WHERE id = _ejecucion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gasto planificado no encontrado'; END IF;
  SELECT * INTO v_rec FROM public.gastos_recurrentes WHERE id = v_ejec.recurrente_id;

  SELECT id INTO v_gasto_id FROM public.gastos WHERE mp_payment_id = m.mp_payment_id LIMIT 1;

  IF v_gasto_id IS NULL THEN
    INSERT INTO public.gastos (
      categoria, subcategoria, descripcion, monto, moneda, fecha,
      recurrente, frecuencia, proveedor, notas, forma_pago,
      origen_registro, estado_conciliacion, mp_payment_id, mp_status,
      unidad_negocio, event_id, registrado_por
    ) VALUES (
      COALESCE(v_rec.categoria, 'otros'),
      v_rec.ambito::text,
      COALESCE(v_rec.concepto, 'Gasto') || ' (' || v_ejec.mes || ')',
      m.amount, m.currency, m.fecha_movimiento::date,
      true, v_rec.frecuencia::text, v_rec.proveedor,
      COALESCE(_notas, 'Vinculado desde Mercado Pago'),
      'mercado_pago', 'mp_egreso', 'conciliado',
      m.mp_payment_id, m.status,
      COALESCE(v_ejec.unidad_negocio, v_rec.unidad_negocio, 'compartido'),
      COALESCE(v_ejec.event_id, v_rec.event_id),
      auth.uid()
    ) RETURNING id INTO v_gasto_id;
  END IF;

  INSERT INTO public.gastos_ejecucion_pagos (
    ejecucion_id, gasto_id, monto, fecha, forma_pago, notas, pagado_por, es_excedente
  ) VALUES (
    _ejecucion_id, v_gasto_id, m.amount, m.fecha_movimiento::date,
    'mercado_pago', COALESCE(_notas, 'MP ' || m.mp_payment_id), auth.uid(), COALESCE(_es_excedente,false)
  );

  UPDATE public.gastos_ejecuciones
     SET gasto_id = COALESCE(gasto_id, v_gasto_id), updated_at = now()
   WHERE id = _ejecucion_id;

  PERFORM public.recalc_gasto_ejecucion(_ejecucion_id);

  UPDATE public.mp_account_movements
     SET gasto_id = v_gasto_id, categorizado_at = now(), categorizado_por = auth.uid()
   WHERE id = _movement_id;

  RETURN v_gasto_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mp_egreso_to_ejecucion(uuid, uuid, text, boolean) TO authenticated;