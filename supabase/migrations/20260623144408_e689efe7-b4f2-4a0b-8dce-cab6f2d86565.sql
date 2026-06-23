
CREATE OR REPLACE FUNCTION public.reuse_pending_subscription(
  p_sub_id uuid,
  p_alumno_id uuid,
  p_plan_id uuid,
  p_estado text,
  p_descuento_id uuid,
  p_precio_base numeric,
  p_precio_final numeric,
  p_metodo_pago text DEFAULT NULL,
  p_origen_registro text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
BEGIN
  SELECT id, alumno_id, plan_id, estado
    INTO v_existing
  FROM public.suscripciones
  WHERE id = p_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUB_NOT_FOUND';
  END IF;

  IF v_existing.alumno_id IS DISTINCT FROM p_alumno_id
     OR v_existing.plan_id IS DISTINCT FROM p_plan_id THEN
    RAISE EXCEPTION 'SUB_OWNER_MISMATCH';
  END IF;

  IF v_existing.estado NOT IN ('pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','vencida') THEN
    RAISE EXCEPTION 'SUB_NOT_PAYABLE';
  END IF;

  IF p_estado NOT IN ('pendiente','pendiente_verificacion') THEN
    RAISE EXCEPTION 'INVALID_TARGET_STATE';
  END IF;

  UPDATE public.suscripciones
  SET estado          = p_estado,
      descuento_id    = p_descuento_id,
      precio_base     = COALESCE(p_precio_base, precio_base),
      precio_final    = COALESCE(p_precio_final, precio_final),
      metodo_pago     = COALESCE(p_metodo_pago, metodo_pago),
      origen_registro = COALESCE(p_origen_registro, origen_registro),
      notas           = COALESCE(p_notas, notas)
  WHERE id = p_sub_id;

  RETURN p_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reuse_pending_subscription(uuid, uuid, uuid, text, uuid, numeric, numeric, text, text, text) TO authenticated, service_role;
