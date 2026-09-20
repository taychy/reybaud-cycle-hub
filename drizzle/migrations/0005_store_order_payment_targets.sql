CREATE OR REPLACE FUNCTION public.get_alumno_store_order_targets(_alumno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orders jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha' DESC), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT jsonb_build_object(
      'id', so.id,
      'order_number', so.order_number,
      'label', 'Pedido #' || COALESCE(so.order_number::text, left(so.id::text, 8)),
      'currency', COALESCE(so.currency, 'ARS'),
      'total', COALESCE(so.total, 0),
      'paid', 0,
      'balance', COALESCE(so.total, 0),
      'estado', so.status,
      'fecha', so.created_at::date::text
    ) AS x
    FROM public.store_orders so
    WHERE so.alumno_id = _alumno_id
      AND so.cancelled_at IS NULL
      AND COALESCE(so.status, '') NOT IN ('cancelado', 'cancelada')
      AND so.pagado_at IS NULL
      AND COALESCE(so.total, 0) > 0.01
      AND NOT EXISTS (
        SELECT 1 FROM public.cuenta_ajustes ca
        WHERE ca.tipo = 'credito'
          AND ca.aplicado_a_fuente_tabla = 'store_orders'
          AND ca.aplicado_a_fuente_id = so.id
      )
  ) s;

  RETURN jsonb_build_object('store_orders', v_orders);
END $function$;