-- Corrige ambigüedad de sede_id/es_principal en set_alumno_sedes
-- y separa pago de logística para pedidos en efectivo:
-- la sede principal se hereda al pedido y el stock se reserva al crear el pedido.

CREATE OR REPLACE FUNCTION public.set_alumno_sedes(
  _alumno_id uuid,
  _sede_ids uuid[],
  _principal_id uuid DEFAULT NULL
)
RETURNS TABLE (sede_id uuid, es_principal boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_principal uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = _alumno_id) THEN
    RAISE EXCEPTION 'alumno_not_found';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT t.x), '{}'::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(_sede_ids, '{}'::uuid[])) AS t(x)
  WHERE t.x IS NOT NULL;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ids) AS u(x)
    WHERE NOT EXISTS (SELECT 1 FROM public.sedes s WHERE s.id = u.x)
  ) THEN
    RAISE EXCEPTION 'invalid_sede';
  END IF;

  IF cardinality(v_ids) = 0 THEN
    v_principal := NULL;
  ELSE
    v_principal := COALESCE(_principal_id, v_ids[1]);
    IF NOT (v_principal = ANY(v_ids)) THEN
      RAISE EXCEPTION 'principal_must_be_selected';
    END IF;
  END IF;

  DELETE FROM public.alumno_sedes AS als
  WHERE als.alumno_id = _alumno_id
    AND NOT (als.sede_id = ANY(v_ids));

  INSERT INTO public.alumno_sedes (alumno_id, sede_id, es_principal)
  SELECT _alumno_id, u.x, false
  FROM unnest(v_ids) AS u(x)
  ON CONFLICT ON CONSTRAINT alumno_sedes_pkey DO NOTHING;

  UPDATE public.alumno_sedes AS als
  SET es_principal = false
  WHERE als.alumno_id = _alumno_id
    AND als.es_principal = true;

  IF v_principal IS NOT NULL THEN
    UPDATE public.alumno_sedes AS als
    SET es_principal = true
    WHERE als.alumno_id = _alumno_id
      AND als.sede_id = v_principal;
  END IF;

  UPDATE public.alumnos AS a
  SET sede_id = v_principal,
      updated_at = now()
  WHERE a.id = _alumno_id;

  RETURN QUERY
  SELECT als.sede_id, als.es_principal
  FROM public.alumno_sedes AS als
  WHERE als.alumno_id = _alumno_id
  ORDER BY als.es_principal DESC, als.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_pedido_tienda_alumno(
  p_alumno_id uuid,
  p_product_id uuid,
  p_cantidad integer,
  p_variante jsonb DEFAULT '{}'::jsonb,
  p_metodo text DEFAULT 'mp'::text,
  p_customer_name text DEFAULT NULL::text,
  p_customer_email text DEFAULT NULL::text
)
RETURNS TABLE(order_id uuid, order_number integer, unit_price numeric, total numeric, campaign_id uuid)
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
  v_sede_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 20 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;
  IF p_metodo NOT IN ('mp','efectivo') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.id=p_alumno_id AND a.user_id=auth.uid()
  ) INTO v_is_owner;

  v_is_admin := has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid());
  IF NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT a.sede_id INTO v_sede_id
  FROM public.alumnos a
  WHERE a.id = p_alumno_id;

  SELECT * INTO v_product
  FROM public.store_products
  WHERE id=p_product_id AND status='active';
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Producto no disponible';
  END IF;

  v_key := public._build_variant_key(p_product_id,p_variante);
  IF v_product.variants IS NOT NULL
     AND jsonb_array_length(v_product.variants)>0
     AND v_key IS NULL THEN
    RAISE EXCEPTION 'Elegí talle / color';
  END IF;

  IF COALESCE(v_product.is_combo,false) THEN
    v_stock := public.get_combo_available_stock(p_product_id,COALESCE(p_variante,'{}'::jsonb));
  ELSIF v_key IS NOT NULL AND v_product.variant_stock IS NOT NULL THEN
    v_stock := COALESCE((v_product.variant_stock->>v_key)::int,0);
  ELSE
    v_stock := v_product.stock;
  END IF;

  IF v_stock IS NOT NULL AND v_stock < p_cantidad THEN
    RAISE EXCEPTION 'Sin stock suficiente (quedan %)',v_stock;
  END IF;

  SELECT * INTO v_precio
  FROM public.resolver_precio_tienda_por_pago(p_product_id,p_variante,p_metodo);
  v_total := ROUND(v_precio.precio_efectivo*p_cantidad,2);

  INSERT INTO public.store_orders(
    alumno_id,customer_name,customer_email,total,currency,status,metodo_pago,sede_retiro_id
  )
  VALUES(
    p_alumno_id,COALESCE(p_customer_name,'Alumno'),p_customer_email,v_total,
    COALESCE(v_product.currency,'ARS'),
    CASE WHEN p_metodo='efectivo' THEN 'pendiente_pago_efectivo' ELSE 'pendiente_pago' END,
    CASE WHEN p_metodo='efectivo' THEN 'efectivo' ELSE 'mp' END,
    v_sede_id
  )
  RETURNING id,store_orders.order_number INTO v_order;

  INSERT INTO public.store_order_items(
    order_id,product_id,product_name,quantity,unit_price,variant_selection,
    precio_lista,precio_cobrado,campaign_id,campaign_nombre,discount_pct
  )
  VALUES(
    v_order.id,p_product_id,v_product.name,p_cantidad,v_precio.precio_efectivo,
    COALESCE(p_variante,'{}'::jsonb),v_precio.precio_lista,v_precio.precio_efectivo,
    v_precio.campaign_id,v_precio.campaign_nombre,v_precio.descuento_pct
  );

  -- El pago y la logística son independientes:
  -- en efectivo se reserva stock y entra a preparación aunque pagado_at siga NULL.
  IF p_metodo='efectivo' THEN
    UPDATE public.store_orders
    SET status='preparando', updated_at=now()
    WHERE id=v_order.id;
  END IF;

  RETURN QUERY
  SELECT v_order.id,v_order.order_number,v_precio.precio_efectivo,v_total,v_precio.campaign_id;
END;
$$;
