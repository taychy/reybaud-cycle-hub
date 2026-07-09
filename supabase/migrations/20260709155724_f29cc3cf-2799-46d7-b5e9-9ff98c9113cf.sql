
CREATE TABLE public.cierres_caja_diarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  efectivo_escuela_sistema NUMERIC(14,2) NOT NULL DEFAULT 0,
  efectivo_viajes_sistema NUMERIC(14,2) NOT NULL DEFAULT 0,
  efectivo_tienda_sistema NUMERIC(14,2) NOT NULL DEFAULT 0,
  efectivo_escuela_contado NUMERIC(14,2),
  efectivo_viajes_contado NUMERIC(14,2),
  efectivo_tienda_contado NUMERIC(14,2),
  diferencia_escuela NUMERIC(14,2),
  diferencia_viajes NUMERIC(14,2),
  diferencia_tienda NUMERIC(14,2),
  diferencia_total NUMERIC(14,2),
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  cerrado_por UUID REFERENCES auth.users(id),
  cerrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cierres_caja_diarios TO authenticated;
GRANT ALL ON public.cierres_caja_diarios TO service_role;

ALTER TABLE public.cierres_caja_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven cierres"
ON public.cierres_caja_diarios FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins crean cierres"
ON public.cierres_caja_diarios FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins editan cierres"
ON public.cierres_caja_diarios FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins borran cierres"
ON public.cierres_caja_diarios FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_cierres_caja_updated
BEFORE UPDATE ON public.cierres_caja_diarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_efectivo_del_dia(p_fecha DATE)
RETURNS TABLE (
  escuela NUMERIC,
  viajes NUMERIC,
  tienda NUMERIC,
  escuela_count INT,
  viajes_count INT,
  tienda_count INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(precio_final) FROM public.suscripciones
      WHERE metodo_pago='efectivo' AND created_at::date=p_fecha AND estado<>'cancelada'),0),
    COALESCE((SELECT SUM(amount) FROM public.reservation_payments
      WHERE payment_method='efectivo' AND status='validado' AND anulado_at IS NULL AND payment_date::date=p_fecha),0),
    COALESCE((SELECT SUM(total) FROM public.store_orders
      WHERE metodo_pago='efectivo' AND cancelled_at IS NULL AND COALESCE(pagado_at,created_at)::date=p_fecha),0),
    (SELECT COUNT(*)::int FROM public.suscripciones
      WHERE metodo_pago='efectivo' AND created_at::date=p_fecha AND estado<>'cancelada'),
    (SELECT COUNT(*)::int FROM public.reservation_payments
      WHERE payment_method='efectivo' AND status='validado' AND anulado_at IS NULL AND payment_date::date=p_fecha),
    (SELECT COUNT(*)::int FROM public.store_orders
      WHERE metodo_pago='efectivo' AND cancelled_at IS NULL AND COALESCE(pagado_at,created_at)::date=p_fecha);
$$;

GRANT EXECUTE ON FUNCTION public.get_efectivo_del_dia(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_efectivo_detalle_del_dia(p_fecha DATE, p_unidad TEXT)
RETURNS TABLE (
  ref_id UUID,
  alumno_nombre TEXT,
  monto NUMERIC,
  moneda TEXT,
  hora TIMESTAMPTZ,
  descripcion TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM (
    SELECT s.id AS ref_id,
           COALESCE(a.nombre || ' ' || a.apellido, a.email, 'Alumno') AS alumno_nombre,
           s.precio_final AS monto,
           'ARS'::text AS moneda,
           s.created_at AS hora,
           ('Suscripción: ' || COALESCE(p.nombre,'Plan')) AS descripcion
    FROM public.suscripciones s
    LEFT JOIN public.alumnos a ON a.id = s.alumno_id
    LEFT JOIN public.planes p ON p.id = s.plan_id
    WHERE p_unidad='escuela' AND s.metodo_pago='efectivo'
      AND s.estado<>'cancelada' AND s.created_at::date=p_fecha

    UNION ALL

    SELECT rp.id, COALESCE(a.nombre || ' ' || a.apellido, a.email, 'Alumno'),
           rp.amount, rp.currency, rp.payment_date, 'Reserva evento'
    FROM public.reservation_payments rp
    LEFT JOIN public.alumnos a ON a.id = rp.alumno_id
    WHERE p_unidad='viajes' AND rp.payment_method='efectivo'
      AND rp.status='validado' AND rp.anulado_at IS NULL AND rp.payment_date::date=p_fecha

    UNION ALL

    SELECT o.id, COALESCE(o.customer_name, a.nombre || ' ' || a.apellido, o.customer_email, 'Cliente'),
           o.total, COALESCE(o.currency,'ARS'), COALESCE(o.pagado_at, o.created_at),
           ('Orden ' || COALESCE(o.order_number::text,''))
    FROM public.store_orders o
    LEFT JOIN public.alumnos a ON a.id = o.alumno_id
    WHERE p_unidad='tienda' AND o.metodo_pago='efectivo'
      AND o.cancelled_at IS NULL AND COALESCE(o.pagado_at,o.created_at)::date=p_fecha
  ) t
  ORDER BY hora ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_efectivo_detalle_del_dia(DATE, TEXT) TO authenticated;
