
CREATE TABLE IF NOT EXISTS public.facturacion_cola (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('suscripcion','reservation_payment','store_order','store_preorder')),
  pago_id text NOT NULL,
  referencia_tipo text NOT NULL,
  referencia_id uuid NOT NULL,
  alumno_id uuid,
  cliente_nombre text,
  cliente_cuit text,
  concepto text NOT NULL,
  monto numeric(14,2) NOT NULL,
  moneda text NOT NULL DEFAULT 'ARS',
  emisor_id uuid REFERENCES public.emisores_fiscales(id) ON DELETE SET NULL,
  segmento text,
  metodo_pago text,
  origen_registro text,
  pagado_at timestamptz NOT NULL,
  periodo_pago date NOT NULL,
  periodo_operativo date NOT NULL,
  motivo_arrastre text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','facturada','excluida','anulada')),
  factura_id uuid REFERENCES public.facturas(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referencia_tipo, referencia_id, pago_id)
);

CREATE INDEX IF NOT EXISTS idx_facturacion_cola_estado ON public.facturacion_cola(estado);
CREATE INDEX IF NOT EXISTS idx_facturacion_cola_periodo_op ON public.facturacion_cola(periodo_operativo);
CREATE INDEX IF NOT EXISTS idx_facturacion_cola_pagado_at ON public.facturacion_cola(pagado_at);
CREATE INDEX IF NOT EXISTS idx_facturacion_cola_alumno ON public.facturacion_cola(alumno_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_cola_ref ON public.facturacion_cola(referencia_tipo, referencia_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturacion_cola TO authenticated;
GRANT ALL ON public.facturacion_cola TO service_role;

ALTER TABLE public.facturacion_cola ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pueden ver la cola de facturación"
  ON public.facturacion_cola FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins pueden modificar la cola de facturación"
  ON public.facturacion_cola FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_facturacion_cola_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facturacion_cola_updated_at ON public.facturacion_cola;
CREATE TRIGGER trg_facturacion_cola_updated_at
  BEFORE UPDATE ON public.facturacion_cola
  FOR EACH ROW EXECUTE FUNCTION public.tg_facturacion_cola_updated_at();

CREATE OR REPLACE FUNCTION public.rebuild_facturacion_cola(p_since timestamptz DEFAULT '2026-05-28'::timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_before int;
  v_total_after int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COUNT(*) INTO v_total_before FROM public.facturacion_cola;

  -- A) Suscripciones pagadas por MP
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

  -- B) Suscripciones cargadas por admin con método de pago explícito
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
    AND lower(s.metodo_pago) NOT IN ('mercadopago','mp','efectivo','cash','pendiente','pendiente_verificacion')
    AND COALESCE(s.origen_registro, '') IN ('cargado_admin','manual')
    AND COALESCE(s.updated_at, s.created_at) >= p_since
    AND COALESCE(s.precio_final, s.precio_base, p.precio, 0) > 0
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  -- C) Pagos de reservas validados
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
    CONCAT('Reserva ', COALESCE(e.name, e.title, 'Evento'),
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
    AND lower(COALESCE(rp.payment_method, '')) NOT IN ('efectivo','cash')
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  -- D) Pedidos de tienda pagados
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
    AND lower(COALESCE(o.metodo_pago, '')) NOT IN ('efectivo','cash')
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  -- E) Preventas con seña confirmada
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
    AND lower(COALESCE(pr.forma_pago_sena, '')) NOT IN ('efectivo','cash')
    AND CASE WHEN pr.estado = 'entregada' THEN pr.precio_total ELSE pr.sena_monto END > 0
  ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;

  -- F) Cruce con facturas ya existentes
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
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_facturacion_cola(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_facturas_sync_cola()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'emitida' AND NEW.cae IS NOT NULL THEN
    UPDATE public.facturacion_cola c
    SET estado = 'facturada',
        factura_id = NEW.id
    WHERE c.referencia_tipo = NEW.referencia_tipo
      AND c.referencia_id = NEW.referencia_id
      AND (c.factura_id IS NULL OR c.factura_id = NEW.id)
      AND c.estado <> 'anulada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facturas_sync_cola ON public.facturas;
CREATE TRIGGER trg_facturas_sync_cola
  AFTER INSERT OR UPDATE OF estado, cae ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_facturas_sync_cola();
