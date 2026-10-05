CREATE OR REPLACE FUNCTION public.delete_liquidacion_mensual(p_liquidacion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liq public.liquidaciones_mensuales%ROWTYPE;
  v_movs int;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado para eliminar liquidaciones';
  END IF;

  SELECT * INTO v_liq FROM public.liquidaciones_mensuales WHERE id = p_liquidacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La liquidación no existe o ya fue eliminada'; END IF;

  IF v_liq.estado = 'pagada' THEN
    RAISE EXCEPTION 'No se puede eliminar una liquidación pagada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gastos WHERE liquidacion_id = p_liquidacion_id) THEN
    RAISE EXCEPTION 'La liquidación tiene un gasto registrado; volvé el estado a revisión antes de eliminarla';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mp_account_movements WHERE liquidacion_id = p_liquidacion_id) THEN
    RAISE EXCEPTION 'La liquidación está vinculada a un movimiento de Mercado Pago';
  END IF;

  UPDATE public.movimientos_liquidacion SET liquidacion_mensual_id = NULL
   WHERE liquidacion_mensual_id = p_liquidacion_id;
  GET DIAGNOSTICS v_movs = ROW_COUNT;

  DELETE FROM public.liquidaciones_mensuales WHERE id = p_liquidacion_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'delete_liquidacion_mensual', 'liquidaciones_mensuales', p_liquidacion_id::text,
    jsonb_build_object('coach_id', v_liq.coach_id, 'mes', v_liq.mes, 'estado', v_liq.estado,
      'total_estimado', v_liq.total_estimado, 'total_confirmado', v_liq.total_confirmado,
      'movimientos_desvinculados', v_movs));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_liquidacion_mensual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_liquidacion_mensual(uuid) TO authenticated;