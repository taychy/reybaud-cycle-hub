CREATE OR REPLACE FUNCTION public.get_store_orders_saldo(_ids uuid[])
RETURNS TABLE(order_id uuid, total numeric, pagado numeric, saldo numeric, currency text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT so.id,
         COALESCE(so.total, 0)::numeric AS total,
         CASE WHEN so.pagado_at IS NOT NULL THEN COALESCE(so.total, 0)::numeric
              ELSE COALESCE((
                SELECT SUM(ca.monto) FROM public.cuenta_ajustes ca
                WHERE ca.tipo = 'credito'
                  AND ca.aplicado_a_fuente_tabla = 'store_orders'
                  AND ca.aplicado_a_fuente_id = so.id
              ), 0)::numeric END AS pagado,
         GREATEST(
           CASE WHEN so.pagado_at IS NOT NULL THEN 0
                ELSE COALESCE(so.total, 0)::numeric - COALESCE((
                  SELECT SUM(ca.monto) FROM public.cuenta_ajustes ca
                  WHERE ca.tipo = 'credito'
                    AND ca.aplicado_a_fuente_tabla = 'store_orders'
                    AND ca.aplicado_a_fuente_id = so.id
                ), 0)::numeric END, 0) AS saldo,
         COALESCE(so.currency, 'ARS') AS currency
  FROM public.store_orders so
  WHERE so.id = ANY(_ids)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'deposito'::app_role)
      OR public.is_super_admin(auth.uid())
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_store_orders_saldo(uuid[]) TO authenticated;