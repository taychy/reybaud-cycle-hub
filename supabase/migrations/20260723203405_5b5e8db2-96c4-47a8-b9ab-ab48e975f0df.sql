
-- Normalizador compartido
CREATE OR REPLACE FUNCTION public._delivery_variant_norm(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(coalesce(v,''), '\s+', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public._supplier_variant_norm(v jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(
    coalesce(
      v->>'talle',
      v->>'variante',
      v->>'nombre',
      CASE WHEN v IS NULL OR v = 'null'::jsonb THEN '' ELSE v::text END
    ),
    '\s+', '', 'g'))
$$;

-- Preview: qué falta y cuánto hay en la lista
CREATE OR REPLACE FUNCTION public.preview_supplier_shortage_vs_delivery(
  _order_id uuid,
  _list_id uuid
)
RETURNS TABLE(
  producto text,
  variante text,
  pedido integer,
  recibido integer,
  faltante integer,
  en_lista numeric,
  a_quitar numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH short AS (
    SELECT
      soi.producto_nombre AS producto,
      COALESCE(soi.variante->>'talle', soi.variante->>'variante', soi.variante->>'nombre', '') AS variante,
      lower(regexp_replace(soi.producto_nombre,'\s+','','g')) AS pkey,
      public._supplier_variant_norm(soi.variante) AS vkey,
      SUM(soi.cantidad_pedida)::int AS pedido,
      SUM(COALESCE(soi.cantidad_recibida,0))::int AS recibido
    FROM public.supplier_order_items soi
    WHERE soi.supplier_order_id = _order_id
    GROUP BY 1,2,3,4
  ),
  del AS (
    SELECT
      lower(regexp_replace(dli.producto,'\s+','','g')) AS pkey,
      public._delivery_variant_norm(dli.variante) AS vkey,
      SUM(dli.cantidad)::numeric AS total
    FROM public.delivery_list_items dli
    WHERE dli.list_id = _list_id
    GROUP BY 1,2
  )
  SELECT
    s.producto,
    s.variante,
    s.pedido,
    s.recibido,
    GREATEST(s.pedido - s.recibido, 0) AS faltante,
    COALESCE(d.total, 0) AS en_lista,
    LEAST(GREATEST(s.pedido - s.recibido, 0)::numeric, COALESCE(d.total,0)) AS a_quitar
  FROM short s
  LEFT JOIN del d ON d.pkey = s.pkey AND d.vkey = s.vkey
  WHERE s.pedido > COALESCE(s.recibido,0)
  ORDER BY s.producto, s.variante;
$$;

GRANT EXECUTE ON FUNCTION public.preview_supplier_shortage_vs_delivery(uuid, uuid) TO authenticated;

-- Aplicar: quita faltantes de la lista en orden FIFO por posicion/created_at
CREATE OR REPLACE FUNCTION public.apply_supplier_shortage_to_delivery(
  _order_id uuid,
  _list_id uuid
)
RETURNS TABLE(
  producto text,
  variante text,
  removido numeric,
  items_borrados integer,
  items_reducidos integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  it RECORD;
  restante numeric;
  usar numeric;
  borrados int;
  reducidos int;
  total_removido numeric;
BEGIN
  -- Bloquear los items de la lista para evitar carreras
  PERFORM 1 FROM public.delivery_list_items WHERE list_id = _list_id FOR UPDATE;

  FOR r IN
    SELECT
      soi.producto_nombre AS prod,
      COALESCE(soi.variante->>'talle', soi.variante->>'variante', soi.variante->>'nombre', '') AS var,
      lower(regexp_replace(soi.producto_nombre,'\s+','','g')) AS pkey,
      public._supplier_variant_norm(soi.variante) AS vkey,
      SUM(soi.cantidad_pedida - COALESCE(soi.cantidad_recibida,0))::numeric AS faltante
    FROM public.supplier_order_items soi
    WHERE soi.supplier_order_id = _order_id
    GROUP BY 1,2,3,4
    HAVING SUM(soi.cantidad_pedida - COALESCE(soi.cantidad_recibida,0)) > 0
  LOOP
    restante := r.faltante;
    borrados := 0;
    reducidos := 0;
    total_removido := 0;

    FOR it IN
      SELECT id, cantidad
      FROM public.delivery_list_items
      WHERE list_id = _list_id
        AND lower(regexp_replace(producto,'\s+','','g')) = r.pkey
        AND public._delivery_variant_norm(variante) = r.vkey
        AND COALESCE(preparado,false) = false  -- no tocar los ya entregados
      ORDER BY COALESCE(posicion, 0), created_at
    LOOP
      EXIT WHEN restante <= 0;
      usar := LEAST(it.cantidad, restante);
      IF usar >= it.cantidad THEN
        DELETE FROM public.delivery_list_items WHERE id = it.id;
        borrados := borrados + 1;
      ELSE
        UPDATE public.delivery_list_items
        SET cantidad = cantidad - usar, updated_at = now()
        WHERE id = it.id;
        reducidos := reducidos + 1;
      END IF;
      total_removido := total_removido + usar;
      restante := restante - usar;
    END LOOP;

    IF total_removido > 0 THEN
      producto := r.prod;
      variante := r.var;
      removido := total_removido;
      items_borrados := borrados;
      items_reducidos := reducidos;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_supplier_shortage_to_delivery(uuid, uuid) TO authenticated;
