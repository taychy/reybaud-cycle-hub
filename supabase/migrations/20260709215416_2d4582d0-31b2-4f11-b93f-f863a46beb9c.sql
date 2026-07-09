
DROP FUNCTION IF EXISTS public.get_conciliacion_del_dia(date);
DROP FUNCTION IF EXISTS public.get_conciliacion_por_cuenta_del_dia(date);

CREATE OR REPLACE FUNCTION public.get_conciliacion_del_dia(p_fecha date)
RETURNS TABLE(
  mp_app_total numeric, mp_app_count integer,
  mp_banco_total numeric, mp_banco_count integer,
  transfer_app_total numeric, transfer_app_count integer,
  huerfanos_count integer, huerfanos_total numeric,
  egresos_app_total numeric, egresos_app_count integer,
  egresos_banco_total numeric, egresos_banco_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH mp_app AS (
    SELECT COALESCE(SUM(amount),0) AS t, COUNT(*)::int AS c FROM (
      SELECT amount FROM public.reservation_payments
        WHERE payment_method IN ('mp','mercadopago','mercado_pago')
          AND status='validado' AND anulado_at IS NULL
          AND payment_date::date = p_fecha
      UNION ALL
      SELECT precio_final FROM public.suscripciones
        WHERE metodo_pago IN ('mp','mercadopago','mercado_pago')
          AND estado <> 'cancelada'
          AND created_at::date = p_fecha
      UNION ALL
      SELECT total FROM public.store_orders
        WHERE metodo_pago IN ('mp','mercadopago','mercado_pago')
          AND cancelled_at IS NULL
          AND COALESCE(pagado_at, created_at)::date = p_fecha
    ) s
  ),
  transfer_app AS (
    SELECT COALESCE(SUM(amount),0) AS t, COUNT(*)::int AS c FROM (
      SELECT amount FROM public.reservation_payments
        WHERE payment_method IN ('transferencia','transfer')
          AND status='validado' AND anulado_at IS NULL
          AND payment_date::date = p_fecha
      UNION ALL
      SELECT precio_final FROM public.suscripciones
        WHERE metodo_pago IN ('transferencia','transfer')
          AND estado <> 'cancelada'
          AND created_at::date = p_fecha
      UNION ALL
      SELECT total FROM public.store_orders
        WHERE metodo_pago IN ('transferencia','transfer')
          AND cancelled_at IS NULL
          AND COALESCE(pagado_at, created_at)::date = p_fecha
    ) s
  ),
  mp_banco AS (
    SELECT COALESCE(SUM(amount),0) AS t, COUNT(*)::int AS c
    FROM public.mp_account_movements
    WHERE fecha_movimiento::date = p_fecha
      AND (
        (COALESCE(tipo,'payment')='payment' AND status IN ('approved','accredited'))
        OR tipo='refund'
      )
  ),
  huerfanos AS (
    SELECT COUNT(*)::int AS c, COALESCE(SUM(amount),0) AS t
    FROM public.mp_account_movements
    WHERE fecha_movimiento::date = p_fecha
      AND (
        (COALESCE(tipo,'payment')='payment' AND status IN ('approved','accredited'))
        OR tipo='refund'
      )
      AND alumno_id IS NULL
      AND reservation_payment_id IS NULL
      AND suscripcion_id IS NULL
  ),
  egresos_app AS (
    SELECT COALESCE(SUM(monto),0) AS t, COUNT(*)::int AS c
    FROM public.gastos
    WHERE fecha = p_fecha
      AND forma_pago IN ('mp','mercadopago','mercado_pago')
  ),
  egresos_banco AS (
    SELECT COALESCE(SUM(ABS(amount)),0) AS t, COUNT(*)::int AS c
    FROM public.mp_account_movements
    WHERE fecha_movimiento::date = p_fecha
      AND tipo IN ('refund','payout','transfer_out','expense')
  )
  SELECT
    (SELECT t FROM mp_app), (SELECT c FROM mp_app),
    (SELECT t FROM mp_banco), (SELECT c FROM mp_banco),
    (SELECT t FROM transfer_app), (SELECT c FROM transfer_app),
    (SELECT c FROM huerfanos), (SELECT t FROM huerfanos),
    (SELECT t FROM egresos_app), (SELECT c FROM egresos_app),
    (SELECT t FROM egresos_banco), (SELECT c FROM egresos_banco);
$$;

GRANT EXECUTE ON FUNCTION public.get_conciliacion_del_dia(date) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_conciliacion_por_cuenta_del_dia(p_fecha date)
RETURNS TABLE(
  cuenta_id uuid,
  cuenta_nombre text,
  mp_app_total numeric,
  mp_app_count integer,
  mp_banco_total numeric,
  mp_banco_count integer,
  egresos_app_total numeric,
  egresos_app_count integer,
  egresos_banco_total numeric,
  egresos_banco_count integer,
  diferencia numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH app AS (
    SELECT cuenta_mp_id, amount FROM (
      SELECT cuenta_mp_id, amount FROM public.reservation_payments
        WHERE payment_method IN ('mp','mercadopago','mercado_pago')
          AND status='validado' AND anulado_at IS NULL
          AND payment_date::date = p_fecha
      UNION ALL
      SELECT cuenta_mp_id, precio_final AS amount FROM public.suscripciones
        WHERE metodo_pago IN ('mp','mercadopago','mercado_pago')
          AND estado <> 'cancelada'
          AND created_at::date = p_fecha
      UNION ALL
      SELECT cuenta_mp_id, total AS amount FROM public.store_orders
        WHERE metodo_pago IN ('mp','mercadopago','mercado_pago')
          AND cancelled_at IS NULL
          AND COALESCE(pagado_at, created_at)::date = p_fecha
    ) s
  ),
  app_agg AS (
    SELECT cuenta_mp_id, COALESCE(SUM(amount),0) AS t, COUNT(*)::int AS c
    FROM app GROUP BY cuenta_mp_id
  ),
  banco_agg AS (
    SELECT cuenta_mp_id, COALESCE(SUM(amount),0) AS t, COUNT(*)::int AS c
    FROM public.mp_account_movements
    WHERE fecha_movimiento::date = p_fecha
      AND (
        (COALESCE(tipo,'payment')='payment' AND status IN ('approved','accredited'))
        OR tipo='refund'
      )
    GROUP BY cuenta_mp_id
  ),
  -- Egresos app: gastos pagados por MP, intentamos atribuir cuenta vía mp_account_movements (por mp_payment_id)
  egresos_app_raw AS (
    SELECT g.monto, m.cuenta_mp_id
    FROM public.gastos g
    LEFT JOIN public.mp_account_movements m
      ON m.mp_payment_id = g.mp_payment_id
    WHERE g.fecha = p_fecha
      AND g.forma_pago IN ('mp','mercadopago','mercado_pago')
  ),
  egresos_app_agg AS (
    SELECT cuenta_mp_id, COALESCE(SUM(monto),0) AS t, COUNT(*)::int AS c
    FROM egresos_app_raw GROUP BY cuenta_mp_id
  ),
  egresos_banco_agg AS (
    SELECT cuenta_mp_id, COALESCE(SUM(ABS(amount)),0) AS t, COUNT(*)::int AS c
    FROM public.mp_account_movements
    WHERE fecha_movimiento::date = p_fecha
      AND tipo IN ('refund','payout','transfer_out','expense')
    GROUP BY cuenta_mp_id
  ),
  ids AS (
    SELECT cuenta_mp_id FROM app_agg
    UNION SELECT cuenta_mp_id FROM banco_agg
    UNION SELECT cuenta_mp_id FROM egresos_app_agg
    UNION SELECT cuenta_mp_id FROM egresos_banco_agg
  )
  SELECT
    i.cuenta_mp_id AS cuenta_id,
    COALESCE(c.nombre, 'Sin cuenta asignada') AS cuenta_nombre,
    COALESCE(a.t, 0) AS mp_app_total,
    COALESCE(a.c, 0) AS mp_app_count,
    COALESCE(b.t, 0) AS mp_banco_total,
    COALESCE(b.c, 0) AS mp_banco_count,
    COALESCE(ea.t, 0) AS egresos_app_total,
    COALESCE(ea.c, 0) AS egresos_app_count,
    COALESCE(eb.t, 0) AS egresos_banco_total,
    COALESCE(eb.c, 0) AS egresos_banco_count,
    (COALESCE(b.t, 0) - COALESCE(eb.t, 0)) - (COALESCE(a.t, 0) - COALESCE(ea.t, 0)) AS diferencia
  FROM ids i
  LEFT JOIN app_agg a ON a.cuenta_mp_id IS NOT DISTINCT FROM i.cuenta_mp_id
  LEFT JOIN banco_agg b ON b.cuenta_mp_id IS NOT DISTINCT FROM i.cuenta_mp_id
  LEFT JOIN egresos_app_agg ea ON ea.cuenta_mp_id IS NOT DISTINCT FROM i.cuenta_mp_id
  LEFT JOIN egresos_banco_agg eb ON eb.cuenta_mp_id IS NOT DISTINCT FROM i.cuenta_mp_id
  LEFT JOIN public.cuentas_mp c ON c.id = i.cuenta_mp_id
  ORDER BY cuenta_nombre;
$$;

GRANT EXECUTE ON FUNCTION public.get_conciliacion_por_cuenta_del_dia(date) TO authenticated, service_role;
