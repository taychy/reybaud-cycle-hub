SET check_function_bodies=off;
CREATE OR REPLACE FUNCTION public.aplicar_saldo_disponible(_pago_origen_tipo text, _pago_origen_id uuid, _obligacion_tipo text, _obligacion_id uuid, _monto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alumno uuid; v_moneda text; v_disp numeric; v_id uuid; v_existente numeric := 0;
  v_tipo text; v_ob_alumno uuid; v_ob_moneda text; v_ob_pend numeric;
BEGIN
  IF NOT public._programa_admin_ok() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  -- Normalización defensiva de aliases legacy ('reservation' -> 'reserva', 'cargo' -> 'otro')
  v_tipo := public.obligacion_tipo_normalizado(_obligacion_tipo);
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Tipo de obligación no soportado: %', _obligacion_tipo;
  END IF;

  SELECT v.alumno_id, v.moneda, v.disponible INTO v_alumno, v_moneda, v_disp
    FROM public.vw_pagos_disponibles v
   WHERE v.pago_origen_tipo = _pago_origen_tipo AND v.pago_origen_id = _pago_origen_id;
  IF v_alumno IS NULL THEN RAISE EXCEPTION 'Pago no encontrado o sin alumno asignado'; END IF;

  -- La obligación debe existir y pertenecer al mismo alumno
  v_ob_alumno := public.obligacion_alumno(v_tipo, _obligacion_id);
  IF public.obligacion_monto(v_tipo, _obligacion_id) IS NULL THEN
    RAISE EXCEPTION 'Obligación no encontrada';
  END IF;
  IF v_ob_alumno IS NOT NULL AND v_ob_alumno <> v_alumno THEN
    RAISE EXCEPTION 'La obligación pertenece a otro alumno';
  END IF;

  -- Misma moneda
  v_ob_moneda := public.obligacion_moneda(v_tipo, _obligacion_id);
  IF v_ob_moneda IS NOT NULL AND v_moneda IS NOT NULL AND upper(v_ob_moneda) <> upper(v_moneda) THEN
    RAISE EXCEPTION 'La moneda del pago (%) no coincide con la de la obligación (%)', v_moneda, v_ob_moneda;
  END IF;

  -- Idempotencia: si ya existe la misma imputación activa por el mismo monto, no se duplica.
  SELECT pi.monto INTO v_existente FROM public.pagos_imputaciones pi
   WHERE pi.pago_origen_tipo = _pago_origen_tipo AND pi.pago_origen_id = _pago_origen_id
     AND pi.obligacion_tipo = v_tipo AND pi.obligacion_id = _obligacion_id
     AND pi.anulado_at IS NULL;

  IF v_existente IS NULL THEN
    IF ROUND(_monto,2) > ROUND(v_disp,2) THEN
      RAISE EXCEPTION 'El monto a aplicar (%) supera el saldo disponible del pago (%)', _monto, v_disp;
    END IF;

    v_ob_pend := public.obligacion_saldo_pendiente(v_tipo, _obligacion_id);
    IF v_ob_pend IS NOT NULL AND ROUND(_monto,2) > ROUND(v_ob_pend,2) + 0.01 THEN
      RAISE EXCEPTION 'El monto a aplicar (%) supera el saldo pendiente de la obligación (%)', _monto, v_ob_pend;
    END IF;
  END IF;

  v_id := public.imputar_pago(_pago_origen_tipo, _pago_origen_id, v_tipo, _obligacion_id,
            v_alumno, _monto, v_moneda, jsonb_build_object('origen','saldo_disponible',
              'obligacion_tipo_recibido', _obligacion_tipo));

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), NULL, 'admin', 'aplicar_saldo_disponible', 'pagos_imputaciones', v_id::text,
    jsonb_build_object('alumno_id', v_alumno, 'pago_origen_tipo', _pago_origen_tipo,
      'pago_origen_id', _pago_origen_id, 'obligacion_tipo', v_tipo,
      'obligacion_tipo_recibido', _obligacion_tipo,
      'obligacion_id', _obligacion_id, 'monto', _monto));

  RETURN jsonb_build_object('imputacion_id', v_id, 'alumno_id', v_alumno, 'monto', _monto,
    'obligacion_tipo', v_tipo,
    'disponible_restante', public.pago_saldo_disponible(_pago_origen_tipo, _pago_origen_id));
END; $function$;
