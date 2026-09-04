CREATE OR REPLACE FUNCTION public.crear_pedido_tienda_alumno(
  p_alumno_id uuid,
  p_product_id uuid,
  p_cantidad integer,
  p_variante jsonb DEFAULT '{}'::jsonb,
  p_metodo text DEFAULT 'mp',
  p_customer_name text DEFAULT NULL,
  p_customer_email text DEFAULT NULL
)
RETURNS TABLE (order_id uuid, order_number integer, unit_price numeric, total numeric, campaign_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_owner boolean;
  v_is_admin boolean;
  v_product record;
  v_precio record;
  v_key text;
  v_stock integer;
  v_total numeric;
  v_order record;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 20 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;
  IF p_metodo NOT IN ('mp', 'efectivo') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = p_alumno_id AND a.user_id = auth.uid())
    INTO v_is_owner;
  v_is_admin := has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid());
  IF NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_product FROM public.store_products WHERE id = p_product_id AND status = 'active';
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Producto no disponible';
  END IF;

  v_key := public._build_variant_key(p_product_id, p_variante);
  IF v_product.variants IS NOT NULL AND jsonb_array_length(v_product.variants) > 0 AND v_key IS NULL THEN
    RAISE EXCEPTION 'Elegí talle / color';
  END IF;

  IF v_key IS NOT NULL AND v_product.variant_stock IS NOT NULL THEN
    v_stock := COALESCE((v_product.variant_stock ->> v_key)::int, 0);
  ELSE
    v_stock := v_product.stock;
  END IF;
  IF v_stock IS NOT NULL AND v_stock < p_cantidad THEN
    RAISE EXCEPTION 'Sin stock suficiente (quedan %)', v_stock;
  END IF;

  SELECT * INTO v_precio FROM public.resolver_precio_tienda_por_pago(p_product_id, p_variante, p_metodo);
  v_total := ROUND(v_precio.precio_efectivo * p_cantidad, 2);

  INSERT INTO public.store_orders (
    alumno_id, customer_name, customer_email, total, currency, status, metodo_pago
  ) VALUES (
    p_alumno_id,
    COALESCE(p_customer_name, 'Alumno'),
    p_customer_email,
    v_total,
    COALESCE(v_product.currency, 'ARS'),
    CASE WHEN p_metodo = 'efectivo' THEN 'pendiente_pago_efectivo' ELSE 'pendiente_pago' END,
    CASE WHEN p_metodo = 'efectivo' THEN 'efectivo' ELSE 'mp' END
  )
  RETURNING id, store_orders.order_number INTO v_order;

  INSERT INTO public.store_order_items (
    order_id, product_id, product_name, quantity, unit_price, variant_selection,
    precio_lista, precio_cobrado, campaign_id, campaign_nombre, discount_pct
  ) VALUES (
    v_order.id, p_product_id, v_product.name, p_cantidad, v_precio.precio_efectivo,
    COALESCE(p_variante, '{}'::jsonb),
    v_precio.precio_lista, v_precio.precio_efectivo, v_precio.campaign_id,
    v_precio.campaign_nombre, v_precio.descuento_pct
  );

  RETURN QUERY SELECT v_order.id, v_order.order_number, v_precio.precio_efectivo, v_total, v_precio.campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_pedido_tienda_alumno(uuid, uuid, integer, jsonb, text, text, text) TO authenticated, service_role;