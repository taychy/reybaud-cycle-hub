-- 1) Fix: cambiar_plan_suscripcion usaba get_active_price_stage (paquetes de eventos)
CREATE OR REPLACE FUNCTION public.cambiar_plan_suscripcion(
  _suscripcion_id uuid, _nuevo_plan_id uuid, _motivo text,
  _usar_precio_del_nuevo_plan boolean DEFAULT true,
  _precio_excepcion numeric DEFAULT NULL::numeric,
  _excepcion_motivo text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_sub record; v_plan record; v_base numeric; v_final numeric; v_desc numeric; v_stage numeric;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = _suscripcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  SELECT * INTO v_plan FROM public.planes WHERE id = _nuevo_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  IF COALESCE(_motivo, '') = '' THEN RAISE EXCEPTION 'motivo_required'; END IF;

  IF _usar_precio_del_nuevo_plan THEN
    SELECT ps.precio INTO v_stage
      FROM public.plan_price_stages ps
     WHERE ps.plan_id = _nuevo_plan_id
       AND COALESCE(ps.activo, true) = true
       AND (ps.fecha_desde IS NULL OR ps.fecha_desde <= CURRENT_DATE)
       AND (ps.fecha_hasta IS NULL OR ps.fecha_hasta >= CURRENT_DATE)
     ORDER BY ps.fecha_desde DESC NULLS LAST, ps.orden NULLS LAST
     LIMIT 1;
    v_base := COALESCE(v_stage, v_plan.precio, 0);
  ELSE
    IF _precio_excepcion IS NULL OR COALESCE(_excepcion_motivo, '') = '' THEN
      RAISE EXCEPTION 'price_exception_requires_amount_and_reason';
    END IF;
    v_base := _precio_excepcion;
  END IF;

  v_desc := CASE
    WHEN COALESCE(v_sub.precio_base, 0) > 0 AND v_sub.precio_final IS NOT NULL
      THEN GREATEST(0, LEAST(1, 1 - (v_sub.precio_final / v_sub.precio_base)))
    ELSE 0
  END;
  v_final := ROUND(v_base * (1 - v_desc), 2);

  PERFORM set_config('app.sub_internal', 'on', true);
  UPDATE public.suscripciones SET
    plan_id = _nuevo_plan_id,
    precio_base = v_base,
    precio_final = v_final,
    notas = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE E'\n' END
            || '[' || to_char(now(), 'YYYY-MM-DD') || '] Corrección de plan → ' || v_plan.nombre
            || ' · ' || _motivo
            || CASE WHEN _usar_precio_del_nuevo_plan THEN '' ELSE ' · EXCEPCIÓN DE PRECIO: ' || _excepcion_motivo END,
    updated_at = now()
  WHERE id = _suscripcion_id;
  PERFORM set_config('app.sub_internal', 'off', true);

  INSERT INTO public.audit_log (user_id, accion, entidad, entidad_id, detalles)
  VALUES (auth.uid(), 'cambiar_plan_suscripcion', 'suscripciones', _suscripcion_id,
    jsonb_build_object(
      'plan_anterior', v_sub.plan_id, 'plan_nuevo', _nuevo_plan_id,
      'precio_base_anterior', v_sub.precio_base, 'precio_final_anterior', v_sub.precio_final,
      'precio_base_nuevo', v_base, 'precio_final_nuevo', v_final,
      'motivo', _motivo, 'excepcion', NOT _usar_precio_del_nuevo_plan, 'excepcion_motivo', _excepcion_motivo));

  RETURN jsonb_build_object('ok', true, 'precio_base', v_base, 'precio_final', v_final,
                            'moneda', COALESCE(v_plan.moneda, 'ARS'));
END $fn$;