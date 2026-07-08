
CREATE OR REPLACE FUNCTION public.rebuild_facturacion_cola(p_since timestamp with time zone DEFAULT '2026-05-28 00:00:00+00'::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_before int;
  v_total_after int;
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
    'suscripcion',
    s.mp_payment_id,
    'suscripcion',
    s.id,
    s.alumno_id,
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
  WHERE s.mp_status = 'approved'
    AND s.mp_payment_id IS NOT NULL
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
    'suscripcion',
    'manual:' || s.id::text,
    'suscripcion',
    s.id,
    s.alumno_id,
    COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'),
    a.documento,
    CONCAT('Suscripción ', COALESCE(p.nombre, '')),
    COALESCE(s.precio_final, s.precio_base, p.precio, 0)::numeric,
    COALESCE(p.moneda, 'ARS'),
    'escuela',
    s.metodo_pago,
    COALESCE(s.origen_registro, 'cargado_admin'),
    COALESCE(s.updated_at, s.created_at),
    date_trunc('month', (COALESCE(s.updated_at, s.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
    date_trunc('month', (COALESCE(s.updated_at, s.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
  FROM public.suscripciones s
  LEFT JOIN public.alumnos a ON a.id = s.alumno_id
  LEFT JOIN public.planes p ON p.id = s.plan_id
  WHERE s.mp_payment_id IS NULL
    AND s.metodo_pago IS NOT NULL
    AND lower(s.metodo_pago) NOT IN ('mercadopago','mp','pendiente','pendiente_verificacion')
    AND COALESCE(s.origen_registro, '') IN ('cargado_admin','manual')
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
    rp.id::text,
    'evento',
    rp.reservation_id,
    rp.alumno_id,
    COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'),
    a.documento,
    CONCAT('Reserva ', COALESCE(e.title, 'Evento'),
           CASE WHEN rp.installment_number IS NOT NULL
                THEN ' — cuota ' || rp.installment_number::text
                ELSE '' END),
    rp.amount::numeric,
    COALESCE(rp.currency, er.currency_snapshot, er.moneda, 'ARS'),
    'viajes',
    rp.payment_method,
    NULL,
    COALESCE(rp.payment_date, rp.reviewed_at, rp.created_at),
    date_trunc('month', (COALESCE(rp.payment_date, rp.reviewed_at, rp.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
    date_trunc('month', (COALESCE(rp.payment_date, rp.reviewed_at, rp.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
  FROM public.reservation_payments rp
  LEFT JOIN public.event_reservations er ON er.id = rp.reservation_id
  LEFT JOIN public.events e ON e.id = er.event_id
  LEFT JOIN public.alumnos a ON a.id = rp.alumno_id
  WHERE rp.status = 'validado'
    AND rp.anulado_at IS NULL
    AND rp.amount > 0
    AND COALESCE(rp.payment_date, rp.reviewed_at, rp.created_at) >= p_since
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  INSERT INTO public.facturacion_cola (
    source, pago_id, referencia_tipo, referencia_id,
    alumno_id, cliente_nombre, cliente_cuit, concepto,
    monto, moneda, segmento, metodo_pago, origen_registro,
    pagado_at, periodo_pago, periodo_operativo
  )
  SELECT
    'store_order',
    COALESCE(o.mp_payment_id, 'order:' || o.id::text),
    'pedido_tienda',
    o.id,
    o.alumno_id,
    COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), o.customer_name, '—'),
    a.documento,
    CONCAT('Pedido tienda #', o.order_number),
    o.total::numeric,
    COALESCE(o.currency, 'ARS'),
    'tienda',
    o.metodo_pago,
    o.origen_registro,
    COALESCE(o.pagado_at, o.updated_at),
    date_trunc('month', (COALESCE(o.pagado_at, o.updated_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
    date_trunc('month', (COALESCE(o.pagado_at, o.updated_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
  FROM public.store_orders o
  LEFT JOIN public.alumnos a ON a.id = o.alumno_id
  WHERE (
      (o.mp_status = 'approved' AND o.mp_payment_id IS NOT NULL)
      OR o.pagado_at IS NOT NULL
    )
    AND o.total > 0
    AND COALESCE(o.pagado_at, o.updated_at) >= p_since
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  INSERT INTO public.facturacion_cola (
    source, pago_id, referencia_tipo, referencia_id,
    alumno_id, cliente_nombre, cliente_cuit, concepto,
    monto, moneda, segmento, metodo_pago, origen_registro,
    pagado_at, periodo_pago, periodo_operativo
  )
  SELECT
    'store_preorder',
    COALESCE(pr.mp_payment_id, 'preorder:' || pr.id::text),
    'pedido',
    pr.id,
    pr.alumno_id,
    COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), pr.alumno_nombre, '—'),
    COALESCE(a.documento, pr.alumno_dni),
    CONCAT(pr.producto_nombre,
           CASE WHEN pr.estado = 'entregada' THEN '' ELSE ' (seña)' END),
    CASE WHEN pr.estado = 'entregada' THEN pr.precio_total ELSE pr.sena_monto END::numeric,
    COALESCE(pr.moneda, 'ARS'),
    'tienda',
    pr.forma_pago_sena,
    NULL,
    COALESCE(pr.sena_pagada_at, pr.entregada_at, pr.updated_at),
    date_trunc('month', (COALESCE(pr.sena_pagada_at, pr.entregada_at, pr.updated_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
    date_trunc('month', (COALESCE(pr.sena_pagada_at, pr.entregada_at, pr.updated_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
  FROM public.store_preorders pr
  LEFT JOIN public.alumnos a ON a.id = pr.alumno_id
  WHERE pr.estado_pago_sena = 'confirmada'
    AND COALESCE(pr.estado, '') NOT IN ('cancelada','vencida')
    AND COALESCE(pr.sena_pagada_at, pr.entregada_at, pr.updated_at) >= p_since
    AND CASE WHEN pr.estado = 'entregada' THEN pr.precio_total ELSE pr.sena_monto END > 0
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  UPDATE public.facturacion_cola c
  SET estado = 'facturada',
      factura_id = f.id
  FROM public.facturas f
  WHERE c.referencia_tipo = f.referencia_tipo
    AND c.referencia_id = f.referencia_id
    AND f.estado = 'emitida'
    AND f.cae IS NOT NULL
    AND (c.estado = 'pendiente' OR c.factura_id IS NULL);

  SELECT COUNT(*) INTO v_total_after FROM public.facturacion_cola;

  RETURN jsonb_build_object(
    'ok', true,
    'total_before', v_total_before,
    'total_after', v_total_after,
    'inserted', v_total_after - v_total_before
  );
END;
$function$;
