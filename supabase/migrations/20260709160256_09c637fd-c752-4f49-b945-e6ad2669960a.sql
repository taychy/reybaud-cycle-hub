
ALTER TABLE public.cierres_caja_diarios
  ADD COLUMN IF NOT EXISTS mp_app_total NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS mp_banco_total NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS transfer_app_total NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS huerfanos_count INT,
  ADD COLUMN IF NOT EXISTS huerfanos_monto NUMERIC(14,2);

CREATE OR REPLACE FUNCTION public.get_conciliacion_del_dia(p_fecha DATE)
RETURNS TABLE (
  mp_app_total NUMERIC,
  mp_app_count INT,
  mp_banco_total NUMERIC,
  mp_banco_count INT,
  transfer_app_total NUMERIC,
  transfer_app_count INT,
  huerfanos_count INT,
  huerfanos_monto NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
    WHERE status IN ('approved','accredited')
      AND fecha_movimiento::date = p_fecha
  ),
  huerfanos AS (
    SELECT COUNT(*)::int AS c, COALESCE(SUM(amount),0) AS t
    FROM public.mp_account_movements
    WHERE status IN ('approved','accredited')
      AND alumno_id IS NULL
      AND reservation_payment_id IS NULL
      AND suscripcion_id IS NULL
      AND fecha_movimiento::date = p_fecha
  )
  SELECT
    (SELECT t FROM mp_app), (SELECT c FROM mp_app),
    (SELECT t FROM mp_banco), (SELECT c FROM mp_banco),
    (SELECT t FROM transfer_app), (SELECT c FROM transfer_app),
    (SELECT c FROM huerfanos), (SELECT t FROM huerfanos);
$$;

GRANT EXECUTE ON FUNCTION public.get_conciliacion_del_dia(DATE) TO authenticated;
