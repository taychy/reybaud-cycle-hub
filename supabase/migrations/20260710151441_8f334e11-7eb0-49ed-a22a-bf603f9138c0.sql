CREATE OR REPLACE FUNCTION public.rebuild_facturacion_cola(p_since timestamp with time zone DEFAULT '2026-05-28 00:00:00+00'::timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_before int;
  v_total_after int;
  v_inserted_reservation int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COUNT(*) INTO v_total_before FROM public.facturacion_cola;

  INSERT INTO public.facturacion_cola (
    source, pago_id, referencia_tipo, referencia_id,
    alumno_id, cliente_nombre, cliente_cuit, concepto,
    monto, moneda, segmento, metodo_pago, origen_registro,
    pagado_at, periodo_pago, periodo_operativo
  )
  SELECT
    'suscripcion', s.mp_payment_id, 'suscripcion', s.id, s.alumno_id,
    COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'),
    a.documento,
    CONCAT('Suscripción ', COALESCE(p.nombre, '')),
    COALESCE(s.precio_final, s.precio_base, p.precio, 0)::numeric,
    COALESCE(p.moneda, 'ARS'),
    'escuela',
    COALESCE(s.metodo_pago, 'mercadopago'),
    s.origen_registro,
    COALESCE(s.updated_at, s.created_at),
    date_trunc('month', (COALESCE(s.updated_at, s.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
    date_trunc('month', (COALESCE(s.updated_at, s.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
  FROM public.suscripciones s
  LEFT JOIN public.alumnos a ON a.id = s.alumno_id
  LEFT JOIN public.planes p ON p.id = s.plan_id
  WHERE s.mp_status = 'approved' AND s.mp_payment_id IS NOT NULL
    AND COALESCE(s.updated_at, s.created_at) >= p_since
    AND COALESCE(s.precio_final, s.precio_base, p.precio, 0) > 0
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  INSERT INTO public.facturacion_cola (
    source, pago_id, referencia_tipo, referencia_id,
    alumno_id, cliente_nombre, cliente_cuit, concepto,
    monto, moneda, segmento, metodo_pago, origen_registro,
    pagado_at, periodo_pago, periodo_operativo
  )
  SELECT
    'suscripcion', 'manual:' || s.id::text, 'suscripcion', s.id, s.alumno_id,
    COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'),
    a.documento,
    CONCAT('Suscripción ', COALESCE(p.nombre, '')),
    COALESCE(s.precio_final, s.precio_base, p.precio, 0)::numeric,
    COALESCE(p.moneda, 'ARS'),
    'escuela',
    COALESCE(s.metodo_pago, 'manual'),
    s.origen_registro,
    COALESCE(s.updated_at, s.created_at),
    date_trunc('month', (COALESCE(s.updated_at, s.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
    date_trunc('month', (COALESCE(s.updated_at, s.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
  FROM public.suscripciones s
  LEFT JOIN public.alumnos a ON a.id = s.alumno_id
  LEFT JOIN public.planes p ON p.id = s.plan_id
  WHERE s.estado = 'activa'
    AND s.mp_payment_id IS NULL
    AND s.metodo_pago IN ('efectivo','transferencia','manual','deposito','otro')
    AND COALESCE(s.updated_at, s.created_at) >= p_since
    AND COALESCE(s.precio_final, s.precio_base, p.precio, 0) > 0
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  INSERT INTO public.facturacion_cola (
    source, pago_id, referencia_tipo, referencia_id,
    alumno_id, cliente_nombre, cliente_cuit, concepto,
    monto, moneda, segmento, metodo_pago, origen_registro,
    pagado_at, periodo_pago, periodo_operativo
  )
  SELECT
    'reservation_payment',
    COALESCE(rp.mp_payment_id, 'reservation:' || rp.id::text),
    'reservation_payment',
    rp.id,
    rp.alumno_id,
    COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'),
    a.documento,
    CONCAT('Evento ', COALESCE(e.title, '')),
    COALESCE(rp.amount, 0)::numeric,
    COALESCE(rp.currency, 'ARS'),
    'eventos',
    COALESCE(rp.payment_method, 'efectivo'),
    'reservation',
    COALESCE(rp.reviewed_at, rp.created_at),
    date_trunc('month', (COALESCE(rp.reviewed_at, rp.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
    date_trunc('month', (COALESCE(rp.reviewed_at, rp.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
  FROM public.reservation_payments rp
  LEFT JOIN public.alumnos a ON a.id = rp.alumno_id
  LEFT JOIN public.event_reservations r ON r.id = rp.reservation_id
  LEFT JOIN public.events e ON e.id = r.event_id
  WHERE rp.status = 'validado'
    AND rp.anulado_at IS NULL
    AND COALESCE(rp.reviewed_at, rp.created_at) >= p_since
    AND COALESCE(rp.amount, 0) > 0
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_reservation = ROW_COUNT;

  SELECT COUNT(*) INTO v_total_after FROM public.facturacion_cola;

  RETURN jsonb_build_object(
    'before', v_total_before,
    'after', v_total_after,
    'delta', v_total_after - v_total_before,
    'reservation_payments_inserted', v_inserted_reservation
  );
END;
$function$;