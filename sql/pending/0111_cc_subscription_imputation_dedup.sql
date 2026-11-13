-- PENDING MIGRATION 0111: isolated candidate only, not registered or applied.
-- Apply later through the database migration tool after approval in a safe environment.
-- Recognize a manually marked subscription only for the part not already imputed.
-- Matching uses MP operation + receiving account + currency, never amount/date alone.

CREATE OR REPLACE FUNCTION public.suscripcion_haber_manual_cc(
  _suscripcion_id uuid,
  _precio numeric
) RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH reconocimiento AS (
    SELECT public.obligacion_imputado('suscripcion',_suscripcion_id) AS imputado,
      COALESCE((
        SELECT sum(ca.monto)
        FROM public.cuenta_ajustes ca
        WHERE ca.tipo='credito'
          AND ca.aplicado_a_fuente_tabla='suscripciones'
          AND ca.aplicado_a_fuente_id=_suscripcion_id
          AND EXISTS (
            SELECT 1
            FROM public.mp_account_movements mp
            JOIN public.pagos_imputaciones pi
              ON pi.pago_origen_tipo='mp_movement'
             AND pi.pago_origen_id=mp.id
             AND pi.obligacion_tipo='suscripcion'
             AND pi.obligacion_id=_suscripcion_id
             AND pi.anulado_at IS NULL
            WHERE mp.mp_payment_id=ca.referencia_externa
              AND mp.cuenta_mp_id=ca.cuenta_mp_id
              AND upper(mp.currency)=upper(ca.moneda)
              AND mp.status='approved'
              AND mp.direccion='ingreso'
          )
      ),0) AS credito_aplicado_misma_operacion
  )
  SELECT GREATEST(
    0::numeric,
    COALESCE(_precio,0::numeric)
      - imputado
      + LEAST(imputado,credito_aplicado_misma_operacion)
  )
  FROM reconocimiento;
$$;

-- The add-back covers a historical applied credit whose imputation row is already
-- suppressed by pago_monto_reconocido_cc. It preserves that single income instead
-- of turning the correction into an accidental write-off.
REVOKE ALL ON FUNCTION public.suscripcion_haber_manual_cc(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.suscripcion_haber_manual_cc(uuid,numeric) TO authenticated,service_role;
COMMENT ON FUNCTION public.suscripcion_haber_manual_cc(uuid,numeric) IS
  'Haber manual residual: precio menos imputaciones activas; conserva una sola representacion cuando un credito aplicado ya representa el mismo MP.';

DO $view$
DECLARE
  d text;
  needle text := $old$ELSE COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
        END AS haber,$old$;
  replacement text := $new$ELSE public.suscripcion_haber_manual_cc(s.id, COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric))
        END AS haber,$new$;
BEGIN
  d:=pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass,true);
  IF strpos(d,needle)=0 THEN
    RAISE EXCEPTION 'vw_cuenta_corriente_movimientos: manual subscription branch not found; abort without changes';
  END IF;
  d:=replace(d,needle,replacement);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos WITH(security_invoker=true) AS '||d;
END
$view$;

-- get_saldo_alumno aggregates this view, so it inherits the same correction.
-- No rows, payments, credits, subscriptions, invoices or historical amounts are changed.
