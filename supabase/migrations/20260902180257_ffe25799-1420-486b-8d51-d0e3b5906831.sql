-- 1) Campañas
CREATE TABLE public.store_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  descripcion text,
  fecha_inicio timestamptz NOT NULL,
  fecha_fin timestamptz NOT NULL,
  activa boolean NOT NULL DEFAULT false,
  badge_texto text,
  mostrar_urgencia boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_campaigns TO authenticated;
GRANT ALL ON public.store_campaigns TO service_role;

ALTER TABLE public.store_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active store_campaigns"
  ON public.store_campaigns FOR SELECT
  USING (activa = true AND now() BETWEEN fecha_inicio AND fecha_fin);

CREATE POLICY "Admins can manage store_campaigns"
  ON public.store_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.store_campaign_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  variant_keys text[] NULL,
  tipo text NOT NULL CHECK (tipo IN ('porcentaje', 'precio_fijo')),
  valor numeric NOT NULL CHECK (valor >= 0),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_campaign_items_campaign ON public.store_campaign_items(campaign_id);
CREATE INDEX idx_store_campaign_items_product ON public.store_campaign_items(product_id);

GRANT SELECT ON public.store_campaign_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_campaign_items TO authenticated;
GRANT ALL ON public.store_campaign_items TO service_role;

ALTER TABLE public.store_campaign_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view items of active store_campaigns"
  ON public.store_campaign_items FOR SELECT
  USING (
    activo = true AND EXISTS (
      SELECT 1 FROM public.store_campaigns c
      WHERE c.id = store_campaign_items.campaign_id
        AND c.activa = true
        AND now() BETWEEN c.fecha_inicio AND c.fecha_fin
    )
  );

CREATE POLICY "Admins can manage store_campaign_items"
  ON public.store_campaign_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_store_campaigns_updated_at
  BEFORE UPDATE ON public.store_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_store_campaign_items_updated_at
  BEFORE UPDATE ON public.store_campaign_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Snapshot auditable en items de pedido (aditivo, nullable)
ALTER TABLE public.store_order_items
  ADD COLUMN IF NOT EXISTS precio_lista numeric NULL,
  ADD COLUMN IF NOT EXISTS precio_cobrado numeric NULL,
  ADD COLUMN IF NOT EXISTS campaign_id uuid NULL REFERENCES public.store_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_nombre text NULL,
  ADD COLUMN IF NOT EXISTS discount_pct numeric NULL;

-- 3) Fuente de verdad de precio efectivo
CREATE OR REPLACE FUNCTION public.resolver_precio_tienda(
  p_product_id uuid,
  p_variante jsonb DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  precio_lista numeric,
  precio_efectivo numeric,
  descuento_pct numeric,
  campaign_id uuid,
  campaign_nombre text,
  badge_texto text,
  mostrar_urgencia boolean,
  fecha_fin timestamptz,
  solo_variantes boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price numeric;
  v_key text;
  v_best record;
BEGIN
  SELECT sp.price INTO v_price FROM public.store_products sp WHERE sp.id = p_product_id;
  IF v_price IS NULL THEN
    RETURN;
  END IF;

  v_key := public._build_variant_key(p_product_id, p_variante);

  SELECT
    c.id AS cid,
    c.nombre AS cnombre,
    c.badge_texto AS cbadge,
    c.mostrar_urgencia AS curg,
    c.fecha_fin AS cfin,
    c.fecha_inicio AS cini,
    (ci.variant_keys IS NOT NULL) AS csolo,
    GREATEST(
      0,
      ROUND(
        CASE WHEN ci.tipo = 'porcentaje'
          THEN v_price * (1 - LEAST(ci.valor, 100) / 100.0)
          ELSE LEAST(ci.valor, v_price)
        END, 2)
    ) AS cprecio
  INTO v_best
  FROM public.store_campaign_items ci
  JOIN public.store_campaigns c ON c.id = ci.campaign_id
  WHERE ci.product_id = p_product_id
    AND ci.activo = true
    AND c.activa = true
    AND now() BETWEEN c.fecha_inicio AND c.fecha_fin
    AND (
      ci.variant_keys IS NULL
      OR (v_key IS NOT NULL AND v_key = ANY (ci.variant_keys))
    )
  ORDER BY 8 ASC, c.fecha_inicio DESC, c.id ASC
  LIMIT 1;

  IF v_best IS NULL OR v_best.cprecio IS NULL OR v_best.cprecio >= v_price THEN
    RETURN QUERY SELECT p_product_id, v_price, v_price, 0::numeric,
      NULL::uuid, NULL::text, NULL::text, false, NULL::timestamptz, false;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    p_product_id,
    v_price,
    v_best.cprecio,
    ROUND((1 - v_best.cprecio / NULLIF(v_price, 0)) * 100, 0),
    v_best.cid,
    v_best.cnombre,
    v_best.cbadge,
    v_best.curg,
    v_best.cfin,
    v_best.csolo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_precio_tienda(uuid, jsonb) TO anon, authenticated, service_role;

-- Listado de promociones vigentes (para grillas de tienda)
CREATE OR REPLACE FUNCTION public.get_promos_tienda_vigentes()
RETURNS TABLE (
  product_id uuid,
  precio_lista numeric,
  precio_efectivo numeric,
  descuento_pct numeric,
  campaign_id uuid,
  campaign_nombre text,
  badge_texto text,
  mostrar_urgencia boolean,
  fecha_fin timestamptz,
  solo_variantes boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH calc AS (
    SELECT
      ci.product_id,
      sp.price AS precio_lista,
      GREATEST(0, ROUND(
        CASE WHEN ci.tipo = 'porcentaje'
          THEN sp.price * (1 - LEAST(ci.valor, 100) / 100.0)
          ELSE LEAST(ci.valor, sp.price)
        END, 2)) AS precio_efectivo,
      c.id AS campaign_id,
      c.nombre AS campaign_nombre,
      c.badge_texto,
      c.mostrar_urgencia,
      c.fecha_fin,
      c.fecha_inicio,
      (ci.variant_keys IS NOT NULL) AS solo_variantes
    FROM public.store_campaign_items ci
    JOIN public.store_campaigns c ON c.id = ci.campaign_id
    JOIN public.store_products sp ON sp.id = ci.product_id
    WHERE ci.activo = true
      AND c.activa = true
      AND now() BETWEEN c.fecha_inicio AND c.fecha_fin
  ), best AS (
    SELECT DISTINCT ON (product_id) *
    FROM calc
    WHERE precio_efectivo < precio_lista
    ORDER BY product_id, precio_efectivo ASC, fecha_inicio DESC, campaign_id ASC
  )
  SELECT product_id, precio_lista, precio_efectivo,
         ROUND((1 - precio_efectivo / NULLIF(precio_lista, 0)) * 100, 0),
         campaign_id, campaign_nombre, badge_texto, mostrar_urgencia, fecha_fin, solo_variantes
  FROM best;
$$;

GRANT EXECUTE ON FUNCTION public.get_promos_tienda_vigentes() TO anon, authenticated, service_role;

-- 4) Creación de pedido interno con precio resuelto en servidor
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

  SELECT * INTO v_precio FROM public.resolver_precio_tienda(p_product_id, p_variante);
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