-- Caja: contar sólo efectivo realmente recibido.
-- Evita considerar como efectivo físico pedidos de tienda aún no pagados
-- y suscripciones en efectivo que siguen pendientes/vencidas.

CREATE OR REPLACE FUNCTION public.get_efectivo_del_dia(p_fecha date)
RETURNS TABLE(
  escuela numeric,
  viajes numeric,
  tienda numeric,
  escuela_count integer,
  viajes_count integer,
  tienda_count integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT SUM(precio_final) FROM public.suscripciones
      WHERE metodo_pago='efectivo'
        AND estado IN ('activa','finalizada','conciliado')
        AND created_at::date=p_fecha),0),
    COALESCE((SELECT SUM(amount) FROM public.reservation_payments
      WHERE payment_method='efectivo'
        AND status='validado'
        AND anulado_at IS NULL
        AND payment_date::date=p_fecha),0),
    COALESCE((SELECT SUM(total) FROM public.store_orders
      WHERE metodo_pago='efectivo'
        AND cancelled_at IS NULL
        AND pagado_at IS NOT NULL
        AND pagado_at::date=p_fecha),0),
    (SELECT COUNT(*)::int FROM public.suscripciones
      WHERE metodo_pago='efectivo'
        AND estado IN ('activa','finalizada','conciliado')
        AND created_at::date=p_fecha),
    (SELECT COUNT(*)::int FROM public.reservation_payments
      WHERE payment_method='efectivo'
        AND status='validado'
        AND anulado_at IS NULL
        AND payment_date::date=p_fecha),
    (SELECT COUNT(*)::int FROM public.store_orders
      WHERE metodo_pago='efectivo'
        AND cancelled_at IS NULL
        AND pagado_at IS NOT NULL
        AND pagado_at::date=p_fecha);
$function$;

CREATE OR REPLACE FUNCTION public.get_efectivo_detalle_del_dia(p_fecha date, p_unidad text)
RETURNS TABLE(
  ref_id uuid,
  alumno_nombre text,
  monto numeric,
  moneda text,
  hora timestamp with time zone,
  descripcion text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
    WHERE p_unidad='escuela'
      AND s.metodo_pago='efectivo'
      AND s.estado IN ('activa','finalizada','conciliado')
      AND s.created_at::date=p_fecha

    UNION ALL

    SELECT rp.id,
           COALESCE(a.nombre || ' ' || a.apellido, a.email, 'Alumno'),
           rp.amount,
           rp.currency,
           rp.payment_date,
           'Reserva evento'
    FROM public.reservation_payments rp
    LEFT JOIN public.alumnos a ON a.id = rp.alumno_id
    WHERE p_unidad='viajes'
      AND rp.payment_method='efectivo'
      AND rp.status='validado'
      AND rp.anulado_at IS NULL
      AND rp.payment_date::date=p_fecha

    UNION ALL

    SELECT o.id,
           COALESCE(o.customer_name, a.nombre || ' ' || a.apellido, o.customer_email, 'Cliente'),
           o.total,
           COALESCE(o.currency,'ARS'),
           o.pagado_at,
           ('Orden ' || COALESCE(o.order_number::text,''))
    FROM public.store_orders o
    LEFT JOIN public.alumnos a ON a.id = o.alumno_id
    WHERE p_unidad='tienda'
      AND o.metodo_pago='efectivo'
      AND o.cancelled_at IS NULL
      AND o.pagado_at IS NOT NULL
      AND o.pagado_at::date=p_fecha
  ) t
  ORDER BY hora ASC;
$function$;
