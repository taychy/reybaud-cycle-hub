-- 1) Campo aditivo: medios de pago en los que aplica la campaña.
ALTER TABLE public.store_campaigns
  ADD COLUMN IF NOT EXISTS medios_pago text[] NOT NULL DEFAULT ARRAY['mp','efectivo']::text[];

ALTER TABLE public.store_campaigns
  DROP CONSTRAINT IF EXISTS store_campaigns_medios_pago_check;

ALTER TABLE public.store_campaigns
  ADD CONSTRAINT store_campaigns_medios_pago_check
  CHECK (
    array_length(medios_pago, 1) >= 1
    AND medios_pago <@ ARRAY['mp','efectivo']::text[]
  );

-- 2) Resolver de precio condicionado por forma de pago (función NUEVA, nombre inequívoco).
--    La función existente resolver_precio_tienda(uuid, jsonb) queda intacta.
CREATE OR REPLACE FUNCTION public.resolver_precio_tienda_por_pago(
  p_product_id uuid,
  p_variante jsonb DEFAULT NULL,
  p_metodo_pago text DEFAULT NULL
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
  solo_variantes boolean,
  medios_pago text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price numeric;
  v_key text;
  v_metodo text;
  v_best record;
BEGIN
  SELECT sp.price INTO v_price FROM public.store_products sp WHERE sp.id = p_product_id;
  IF v_price IS NULL THEN
    RETURN;
  END IF;

  v_metodo := CASE WHEN p_metodo_pago IN ('mp','efectivo') THEN p_metodo_pago ELSE NULL END;
  v_key := public._build_variant_key(p_product_id, p_variante);

  SELECT
    c.id AS cid,
    c.nombre AS cnombre,
    c.badge_texto AS cbadge,
    c.mostrar_urgencia AS curg,
    c.fecha_fin AS cfin,
    c.fecha_inicio AS cini,
    (ci.variant_keys IS NOT NULL) AS csolo,
    c.medios_pago AS cmedios,
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
    AND (v_metodo IS NULL OR v_metodo = ANY (c.medios_pago))
    AND (
      ci.variant_keys IS NULL
      OR (v_key IS NOT NULL AND v_key = ANY (ci.variant_keys))
    )
  ORDER BY 9 ASC, c.fecha_inicio DESC, c.id ASC
  LIMIT 1;

  IF v_best IS NULL OR v_best.cprecio IS NULL OR v_best.cprecio >= v_price THEN
    RETURN QUERY SELECT p_product_id, v_price, v_price, 0::numeric,
      NULL::uuid, NULL::text, NULL::text, false, NULL::timestamptz, false, NULL::text[];
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
    v_best.csolo,
    v_best.cmedios;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_precio_tienda_por_pago(uuid, jsonb, text) TO anon, authenticated, service_role;

-- 3) Listado de promos vigentes con medio de pago (función NUEVA; la actual queda intacta).
CREATE OR REPLACE FUNCTION public.get_promos_tienda_vigentes_por_pago(
  p_metodo_pago text DEFAULT NULL
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
  solo_variantes boolean,
  medios_pago text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH calc AS (
    SELECT
      ci.product_id AS pid,
      sp.price AS precio_lista,
      GREATEST(0, ROUND(
        CASE WHEN ci.tipo = 'porcentaje'
          THEN sp.price * (1 - LEAST(ci.valor, 100) / 100.0)
          ELSE LEAST(ci.valor, sp.price)
        END, 2)) AS precio_efectivo,
      c.id AS cid,
      c.nombre AS cnombre,
      c.badge_texto AS cbadge,
      c.mostrar_urgencia AS curg,
      c.fecha_fin AS cfin,
      c.fecha_inicio AS cini,
      (ci.variant_keys IS NOT NULL) AS csolo,
      c.medios_pago AS cmedios
    FROM public.store_campaign_items ci
    JOIN public.store_campaigns c ON c.id = ci.campaign_id
    JOIN public.store_products sp ON sp.id = ci.product_id
    WHERE ci.activo = true
      AND c.activa = true
      AND now() BETWEEN c.fecha_inicio AND c.fecha_fin
      AND (
        p_metodo_pago IS NULL
        OR p_metodo_pago NOT IN ('mp','efectivo')
        OR p_metodo_pago = ANY (c.medios_pago)
      )
  ), best AS (
    SELECT DISTINCT ON (pid) *
    FROM calc
    WHERE precio_efectivo < precio_lista
    ORDER BY pid, precio_efectivo ASC, cini DESC, cid ASC
  )
  SELECT pid, precio_lista, precio_efectivo,
         ROUND((1 - precio_efectivo / NULLIF(precio_lista, 0)) * 100, 0),
         cid, cnombre, cbadge, curg, cfin, csolo, cmedios
  FROM best;
$$;

GRANT EXECUTE ON FUNCTION public.get_promos_tienda_vigentes_por_pago(text) TO anon, authenticated, service_role;