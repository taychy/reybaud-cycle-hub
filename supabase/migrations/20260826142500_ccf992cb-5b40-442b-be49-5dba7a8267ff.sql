CREATE OR REPLACE FUNCTION public.enqueue_reservation_payment_facturacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alumno_nombre text;
  v_alumno_doc text;
  v_evento_nombre text;
  v_pago_id text;
BEGIN
  -- Solo actuar cuando el estado pasa a 'validado'
  IF NEW.status = 'validado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validado') THEN
    v_pago_id := COALESCE(NEW.mp_payment_id, 'reservation:' || NEW.id::text);

    SELECT COALESCE(NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'), a.documento
      INTO v_alumno_nombre, v_alumno_doc
    FROM public.alumnos a WHERE a.id = NEW.alumno_id;

    SELECT e.title INTO v_evento_nombre
    FROM public.event_reservations r
    LEFT JOIN public.events e ON e.id = r.event_id
    WHERE r.id = NEW.reservation_id;

    INSERT INTO public.facturacion_cola (
      source, pago_id, referencia_tipo, referencia_id,
      alumno_id, cliente_nombre, cliente_cuit, concepto,
      monto, moneda, segmento, metodo_pago, origen_registro,
      pagado_at, periodo_pago, periodo_operativo
    ) VALUES (
      'reservation_payment',
      v_pago_id,
      'reservation_payment',
      NEW.id,
      NEW.alumno_id,
      COALESCE(v_alumno_nombre, '—'),
      v_alumno_doc,
      CONCAT('Evento ', COALESCE(v_evento_nombre, '')),
      COALESCE(NEW.amount, 0)::numeric,
      COALESCE(NEW.currency, 'ARS'),
      'viajes',
      COALESCE(NEW.payment_method, 'efectivo'),
      'reservation',
      COALESCE(NEW.reviewed_at, NEW.created_at),
      date_trunc('month', (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
      date_trunc('month', (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date
    )
    ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
  END IF;

  -- Si se anula, marcar como excluida si aún no fue facturada
  IF NEW.anulado_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.anulado_at IS NULL) THEN
    UPDATE public.facturacion_cola
    SET estado = 'excluida',
        notas = COALESCE(notas || ' | ', '') || 'Pago anulado: ' || COALESCE(NEW.anulado_motivo, ''),
        updated_at = now()
    WHERE referencia_tipo = 'reservation_payment'
      AND referencia_id = NEW.id
      AND estado = 'pendiente';
  END IF;

  RETURN NEW;
END;
$function$;

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
    'viajes',
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