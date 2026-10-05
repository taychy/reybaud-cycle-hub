-- v3: audit_log incluye user_role (obligatorio). Resto igual a v2.
CREATE OR REPLACE FUNCTION public.vincular_devolucion_mp(p_movement_id uuid, p_confirmar boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.mp_account_movements%ROWTYPE;
  v_orig text; v_monto numeric; v_existing uuid;
  v_rp_n int; v_so_n int;
  v_rp public.reservation_payments%ROWTYPE; v_so public.store_orders%ROWTYPE;
  v_origen text; v_alumno uuid; v_cliente text; v_pago_monto numeric; v_ya_devuelto numeric; v_dev_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO m FROM public.mp_account_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF m.tipo <> 'refund' THEN RAISE EXCEPTION 'El movimiento no es una devolución de Mercado Pago'; END IF;

  SELECT id INTO v_existing FROM public.devoluciones WHERE mp_movement_id = m.id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','ya_vinculada','devolucion_id', v_existing);
  END IF;

  v_orig := coalesce(nullif(m.raw->>'payment_id',''), nullif(split_part(m.mp_payment_id, ':', 1),''));
  v_monto := abs(coalesce(m.amount,0));
  IF v_orig IS NULL OR v_monto <= 0 THEN
    RETURN jsonb_build_object('status','revision_manual','motivo','El refund no indica el pago original o el monto');
  END IF;

  SELECT count(*) INTO v_rp_n FROM public.reservation_payments WHERE (mp_payment_id = v_orig OR (mp_payment_id IS NULL AND payment_reference = v_orig)) AND anulado_at IS NULL;
  SELECT count(*) INTO v_so_n FROM public.store_orders WHERE mp_payment_id = v_orig;
  IF v_rp_n + v_so_n <> 1 THEN
    RETURN jsonb_build_object('status','revision_manual','pago_original', v_orig,
      'motivo', CASE WHEN v_rp_n + v_so_n = 0 THEN 'No se encontró el pago original en Viajes ni en Tienda'
                     ELSE 'El pago original coincide con más de un registro' END);
  END IF;

  IF v_rp_n = 1 THEN
    SELECT * INTO v_rp FROM public.reservation_payments WHERE (mp_payment_id = v_orig OR (mp_payment_id IS NULL AND payment_reference = v_orig)) AND anulado_at IS NULL;
    v_origen := 'viajes'; v_alumno := v_rp.alumno_id; v_pago_monto := v_rp.amount;
    SELECT coalesce(sum(monto),0) INTO v_ya_devuelto FROM public.devoluciones WHERE reservation_payment_id = v_rp.id;
  ELSE
    SELECT * INTO v_so FROM public.store_orders WHERE mp_payment_id = v_orig;
    v_origen := 'tienda'; v_alumno := v_so.alumno_id; v_pago_monto := v_so.total;
    SELECT coalesce(sum(monto),0) INTO v_ya_devuelto FROM public.devoluciones WHERE store_order_id = v_so.id;
  END IF;

  SELECT coalesce(NULLIF(TRIM(CONCAT(a.nombre,' ',a.apellido)),''), v_so.customer_name) INTO v_cliente
  FROM (SELECT 1) x LEFT JOIN public.alumnos a ON a.id = v_alumno;

  IF v_alumno IS NULL THEN
    RETURN jsonb_build_object('status','revision_manual','pago_original', v_orig, 'origen', v_origen,
      'motivo','El pago original no tiene ficha de alumno/cliente');
  END IF;
  IF v_monto > coalesce(v_pago_monto,0) - v_ya_devuelto + 0.01 THEN
    RETURN jsonb_build_object('status','revision_manual','pago_original', v_orig, 'origen', v_origen,
      'motivo','El monto devuelto supera lo pendiente de devolver de ese pago');
  END IF;

  IF NOT p_confirmar THEN
    RETURN jsonb_build_object('status','match','origen', v_origen, 'cliente', v_cliente, 'alumno_id', v_alumno,
      'monto', v_monto, 'moneda', coalesce(m.currency,'ARS'), 'pago_original', v_orig,
      'pago_monto', v_pago_monto, 'ya_devuelto', v_ya_devuelto,
      'parcial', v_monto + v_ya_devuelto < coalesce(v_pago_monto,0) - 0.01, 'gasto_id', m.gasto_id);
  END IF;

  INSERT INTO public.devoluciones (alumno_id, monto, moneda, fecha, metodo, referencia, motivo, mp_movement_id,
    cuenta_mp_id, reservation_id, reservation_payment_id, store_order_id, gasto_id, created_by)
  VALUES (v_alumno, v_monto, coalesce(m.currency,'ARS'),
    (coalesce(m.fecha_movimiento, now()) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    'mercadopago', m.mp_payment_id, 'Devolución Mercado Pago vinculada', m.id, m.cuenta_mp_id,
    v_rp.reservation_id, v_rp.id, v_so.id, m.gasto_id, auth.uid())
  ON CONFLICT (mp_movement_id) DO NOTHING
  RETURNING id INTO v_dev_id;

  IF v_dev_id IS NULL THEN
    SELECT id INTO v_dev_id FROM public.devoluciones WHERE mp_movement_id = m.id;
    RETURN jsonb_build_object('status','ya_vinculada','devolucion_id', v_dev_id);
  END IF;

  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END,
    'devolucion_mp_vinculada', 'devoluciones', v_dev_id::text,
    jsonb_build_object('mp_movement_id', m.id, 'pago_original', v_orig, 'origen', v_origen, 'monto', v_monto, 'gasto_id', m.gasto_id));

  RETURN jsonb_build_object('status','vinculada','devolucion_id', v_dev_id, 'origen', v_origen);
END;
$$;
REVOKE ALL ON FUNCTION public.vincular_devolucion_mp(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_devolucion_mp(uuid, boolean) TO authenticated;