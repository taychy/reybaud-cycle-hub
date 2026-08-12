CREATE OR REPLACE FUNCTION public.preview_baja_programa(_suscripcion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_s record; v_pagado numeric := 0; v_ficticio boolean := false;
BEGIN
  SELECT s.*, p.nombre AS plan_nombre, p.moneda AS plan_moneda, p.es_programa_cerrado,
         a.nombre AS al_nombre, a.apellido AS al_apellido, a.email AS al_email
    INTO v_s
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    JOIN public.alumnos a ON a.id = s.alumno_id
   WHERE s.id = _suscripcion_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','SUSCRIPCION_NO_ENCONTRADA'); END IF;

  SELECT COALESCE(SUM(m.haber),0) INTO v_pagado
    FROM public.vw_cuenta_corriente_movimientos m
   WHERE m.fuente_tabla = 'suscripciones' AND m.fuente_id = _suscripcion_id;

  v_ficticio := v_pagado > 0 AND NOT EXISTS (
    SELECT 1 FROM public.mp_account_movements mm
     WHERE mm.suscripcion_id = _suscripcion_id AND mm.status = 'approved'
  ) AND COALESCE(v_s.mp_payment_id,'') = '';

  RETURN jsonb_build_object(
    'suscripcion_id', v_s.id,
    'alumno_id', v_s.alumno_id,
    'alumno', trim(coalesce(v_s.al_nombre,'') || ' ' || coalesce(v_s.al_apellido,'')),
    'email', v_s.al_email,
    'plan_id', v_s.plan_id,
    'plan_nombre', v_s.plan_nombre,
    'es_programa_cerrado', COALESCE(v_s.es_programa_cerrado,false),
    'estado', v_s.estado,
    'moneda', COALESCE(v_s.plan_moneda, 'ARS'),
    'precio', COALESCE(v_s.precio_final, 0),
    'pagado_real', v_pagado,
    'saldo', GREATEST(0, COALESCE(v_s.precio_final,0) - v_pagado),
    'pago_ficticio', v_ficticio,
    'mp_payment_id', v_s.mp_payment_id
  );
END;
$fn$;