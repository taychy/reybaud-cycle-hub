
-- 1) Nueva RPC: expira subs "activa" del alumno cuya fecha_fin ya pasó.
--    Usada por el frontend antes de intentar crear una sub nueva, para que el
--    trigger de duplicado no la bloquee cuando el cron aún no marcó vencidas.
CREATE OR REPLACE FUNCTION public.expire_stale_subscriptions_for_alumno(
  p_alumno_id uuid,
  p_plan_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_alumno_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Solo toca subs claramente vencidas (fecha_fin < hoy) que quedaron "activa"
  -- porque el cron aún no corrió. No toca canceladas ni pausas.
  WITH updated AS (
    UPDATE public.suscripciones s
    SET estado = 'vencida',
        updated_at = now()
    FROM public.planes p
    WHERE s.plan_id = p.id
      AND s.alumno_id = p_alumno_id
      AND (p_plan_id IS NULL OR s.plan_id = p_plan_id)
      AND s.estado = 'activa'
      AND s.cancelada_at IS NULL
      AND s.fecha_fin IS NOT NULL
      AND s.fecha_fin < CURRENT_DATE
      AND COALESCE(p.categoria, '') <> 'pausa'
    RETURNING s.id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_subscriptions_for_alumno(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_subscriptions_for_alumno(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_subscriptions_for_alumno(uuid, uuid) TO service_role;

-- 2) Endurecer reuse_pending_subscription: ya NO reutilizar 'vencida'.
--    Las vencidas son historia; el pago del nuevo período debe crear sub nueva.
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
SET search_path TO 'public'
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

  -- Solo intenciones de pago no completadas del MISMO período. 'vencida'
  -- queda fuera a propósito para preservar historia por período.
  IF v_existing.estado NOT IN ('pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado') THEN
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
