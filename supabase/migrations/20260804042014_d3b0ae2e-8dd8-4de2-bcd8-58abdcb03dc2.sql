CREATE OR REPLACE FUNCTION public.apply_credit_ajuste_to_suscripcion(_ajuste_id uuid, _suscripcion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aj record;
  v_sub record;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_aj FROM public.cuenta_ajustes WHERE id = _ajuste_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ajuste_not_found'; END IF;
  IF v_aj.tipo <> 'credito' THEN RAISE EXCEPTION 'only_credit_can_be_applied'; END IF;
  IF v_aj.aplicado_a_fuente_id IS NOT NULL THEN RAISE EXCEPTION 'credit_already_applied'; END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = _suscripcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  IF v_sub.alumno_id <> v_aj.alumno_id THEN RAISE EXCEPTION 'subscription_of_other_student'; END IF;
  IF COALESCE(v_sub.mp_status, '') = 'approved' THEN RAISE EXCEPTION 'subscription_already_paid'; END IF;

  PERFORM set_config('app.sub_internal', 'on', true);

  UPDATE public.suscripciones SET
    mp_payment_id  = COALESCE(mp_payment_id, v_aj.referencia_externa),
    mp_status      = 'approved',
    metodo_pago    = COALESCE(v_aj.medio_pago, metodo_pago, 'mercadopago'),
    cuenta_mp_id   = COALESCE(cuenta_mp_id, v_aj.cuenta_mp_id),
    estado         = CASE WHEN estado IN ('pendiente','pendiente_verificacion','vencida') THEN 'activa' ELSE estado END,
    notas          = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE E'\n' END
                     || 'Pago aplicado desde cuenta corriente (ajuste ' || _ajuste_id::text || ')',
    updated_at     = now()
  WHERE id = _suscripcion_id;

  PERFORM set_config('app.sub_internal', 'off', true);

  UPDATE public.cuenta_ajustes SET
    aplicado_a_fuente_tabla = 'suscripciones',
    aplicado_a_fuente_id    = _suscripcion_id,
    updated_at = now()
  WHERE id = _ajuste_id;

  UPDATE public.mp_account_movements
     SET suscripcion_id = _suscripcion_id
   WHERE v_aj.referencia_externa IS NOT NULL
     AND mp_payment_id = v_aj.referencia_externa
     AND suscripcion_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'suscripcion_id', _suscripcion_id, 'ajuste_id', _ajuste_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_credit_ajuste_to_suscripcion(uuid, uuid) TO authenticated;