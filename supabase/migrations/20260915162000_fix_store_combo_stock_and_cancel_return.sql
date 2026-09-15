-- Separa el stock real de componentes de combos y evita reponer mercadería
-- cancelada mientras todavía está fuera del depósito.

DROP INDEX IF EXISTS public.uniq_sm_egreso_venta;
CREATE UNIQUE INDEX uniq_sm_egreso_venta
  ON public.stock_movements(order_item_id, product_id)
  WHERE tipo='egreso' AND order_item_id IS NOT NULL AND product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_combo_available_stock(
  p_combo_id uuid,
  p_selection jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_combo record;
  v_item record;
  v_min integer := NULL;
  v_component_stock integer;
  v_component_key text;
  v_direct text;
BEGIN
  SELECT * INTO v_combo FROM public.store_products WHERE id = p_combo_id;
  IF v_combo IS NULL OR NOT v_combo.is_combo THEN RETURN 0; END IF;
  IF v_combo.is_preorder THEN RETURN COALESCE(v_combo.preorder_total_units, 9999); END IF;

  FOR v_item IN
    SELECT * FROM public.store_combo_items
    WHERE combo_id = p_combo_id AND obligatorio = true
    ORDER BY sort_order
  LOOP
    IF v_item.component_product_id IS NOT NULL THEN
      v_component_key := public._build_variant_key(
        v_item.component_product_id,
        COALESCE(p_selection,'{}'::jsonb)
      );
      IF v_component_key IS NULL THEN
        v_direct := COALESCE(p_selection->>v_item.component_product_id::text, '');
        IF v_direct <> '' THEN
          v_component_key := public.resolve_variant_key(v_item.component_product_id, v_direct);
        END IF;
      END IF;

      SELECT CASE
        WHEN v_component_key IS NOT NULL
          AND COALESCE(variant_stock,'{}'::jsonb) ? v_component_key
          THEN (variant_stock->>v_component_key)::int
        ELSE stock
      END
      INTO v_component_stock
      FROM public.store_products
      WHERE id = v_item.component_product_id;
    ELSE
      v_direct := COALESCE(p_selection->>('i_' || v_item.id::text), '');
      v_component_stock := CASE WHEN v_direct <> ''
        THEN COALESCE((v_item.internal_stock->>v_direct)::int,0)
        ELSE COALESCE((
          SELECT min(value::int)
          FROM jsonb_each_text(COALESCE(v_item.internal_stock,'{}'::jsonb))
        ),0)
      END;
    END IF;

    v_component_stock := COALESCE(v_component_stock,0);
    IF v_min IS NULL OR v_component_stock < v_min THEN
      v_min := v_component_stock;
    END IF;
  END LOOP;

  RETURN COALESCE(v_min,0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_combo_stock(p_combo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_combo record;
  v_key text;
  v_part text;
  v_selection jsonb;
  v_new jsonb := '{}'::jsonb;
BEGIN
  SELECT id,is_combo,is_preorder,variant_stock INTO v_combo
  FROM public.store_products WHERE id=p_combo_id;
  IF NOT FOUND OR NOT v_combo.is_combo OR v_combo.is_preorder THEN RETURN; END IF;

  IF v_combo.variant_stock IS NOT NULL AND v_combo.variant_stock <> '{}'::jsonb THEN
    FOR v_key IN SELECT jsonb_object_keys(v_combo.variant_stock) LOOP
      v_selection := '{}'::jsonb;
      FOREACH v_part IN ARRAY string_to_array(v_key,'|') LOOP
        v_selection := v_selection || jsonb_build_object(
          split_part(v_part,':',1),
          substring(v_part from position(':' in v_part)+1)
        );
      END LOOP;
      v_new := jsonb_set(
        v_new,
        ARRAY[v_key],
        to_jsonb(public.get_combo_available_stock(p_combo_id,v_selection)),
        true
      );
    END LOOP;
    UPDATE public.store_products
      SET variant_stock=v_new, updated_at=now()
      WHERE id=p_combo_id;
  ELSE
    UPDATE public.store_products
      SET stock=public.get_combo_available_stock(p_combo_id,'{}'::jsonb), updated_at=now()
      WHERE id=p_combo_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_refresh_combo_stock_from_component()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_combo_id uuid;
BEGIN
  FOR v_combo_id IN
    SELECT DISTINCT combo_id
    FROM public.store_combo_items
    WHERE component_product_id=NEW.id
  LOOP
    PERFORM public.refresh_combo_stock(v_combo_id);
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_combo_stock_from_component ON public.store_products;
CREATE TRIGGER trg_refresh_combo_stock_from_component
AFTER UPDATE OF stock,variant_stock ON public.store_products
FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_combo_stock_from_component();

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
AS $function$
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
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 20 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  IF p_metodo NOT IN ('mp','efectivo') THEN RAISE EXCEPTION 'Método de pago inválido'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.id=p_alumno_id AND a.user_id=auth.uid()
  ) INTO v_is_owner;
  v_is_admin := has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid());
  IF NOT (v_is_owner OR v_is_admin) THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_product
  FROM public.store_products
  WHERE id=p_product_id AND status='active';
  IF v_product IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;

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
    alumno_id,customer_name,customer_email,total,currency,status,metodo_pago
  ) VALUES(
    p_alumno_id,
    COALESCE(p_customer_name,'Alumno'),
    p_customer_email,
    v_total,
    COALESCE(v_product.currency,'ARS'),
    CASE WHEN p_metodo='efectivo' THEN 'pendiente_pago_efectivo' ELSE 'pendiente_pago' END,
    CASE WHEN p_metodo='efectivo' THEN 'efectivo' ELSE 'mp' END
  ) RETURNING id,store_orders.order_number INTO v_order;

  INSERT INTO public.store_order_items(
    order_id,product_id,product_name,quantity,unit_price,variant_selection,
    precio_lista,precio_cobrado,campaign_id,campaign_nombre,discount_pct
  ) VALUES(
    v_order.id,p_product_id,v_product.name,p_cantidad,v_precio.precio_efectivo,
    COALESCE(p_variante,'{}'::jsonb),v_precio.precio_lista,v_precio.precio_efectivo,
    v_precio.campaign_id,v_precio.campaign_nombre,v_precio.descuento_pct
  );

  RETURN QUERY SELECT v_order.id,v_order.order_number,v_precio.precio_efectivo,v_total,v_precio.campaign_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_store_order_stock_egreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  c RECORD;
  v_key text;
  v_is_combo boolean;
  v_direct text;
BEGIN
  IF NOT public.store_order_compromete_stock(NEW.status) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND public.store_order_compromete_stock(OLD.status) THEN RETURN NEW; END IF;

  FOR r IN
    SELECT oi.id,oi.product_id,oi.quantity,oi.variant_selection
    FROM public.store_order_items oi
    WHERE oi.order_id=NEW.id AND oi.product_id IS NOT NULL
  LOOP
    SELECT COALESCE(is_combo,false) INTO v_is_combo
    FROM public.store_products WHERE id=r.product_id;

    IF v_is_combo THEN
      FOR c IN
        SELECT * FROM public.store_combo_items
        WHERE combo_id=r.product_id
          AND obligatorio=true
          AND component_product_id IS NOT NULL
        ORDER BY sort_order
      LOOP
        CONTINUE WHEN EXISTS(
          SELECT 1 FROM public.stock_movements
          WHERE order_item_id=r.id
            AND product_id=c.component_product_id
            AND tipo='egreso'
        );

        v_key := public._build_variant_key(
          c.component_product_id,
          COALESCE(r.variant_selection,'{}'::jsonb)
        );
        IF v_key IS NULL THEN
          v_direct := COALESCE(r.variant_selection->>c.component_product_id::text,'');
          IF v_direct<>'' THEN
            v_key := public.resolve_variant_key(c.component_product_id,v_direct);
          END IF;
        END IF;

        BEGIN
          PERFORM public.adjust_store_stock(
            c.component_product_id,v_key,-GREATEST(COALESCE(r.quantity,1),0),
            'Venta combo pedido #'||NEW.order_number,NEW.id,auth.uid(),r.id,NULL,false
          );
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
      END LOOP;
    ELSE
      CONTINUE WHEN EXISTS(
        SELECT 1 FROM public.stock_movements
        WHERE order_item_id=r.id AND product_id=r.product_id AND tipo='egreso'
      );
      v_key := public._build_variant_key(r.product_id,COALESCE(r.variant_selection,'{}'::jsonb));
      BEGIN
        PERFORM public.adjust_store_stock(
          r.product_id,v_key,-GREATEST(COALESCE(r.quantity,1),0),
          'Venta pedido #'||NEW.order_number,NEW.id,auth.uid(),r.id,NULL,false
        );
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._cancel_store_order_core(
  p_order_id uuid,
  p_reason text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  m RECORD;
  v_rev int:=0;
  v_deferred boolean:=false;
BEGIN
  SELECT * INTO v_order
  FROM public.store_orders
  WHERE id=p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  IF v_order.status='entregado' THEN
    RAISE EXCEPTION 'El pedido ya fue entregado. Registrá una devolución antes de cancelar.';
  END IF;
  IF v_order.status IN ('en_camioneta','enviado') THEN
    v_deferred:=true;
  END IF;

  IF NOT v_deferred THEN
    FOR m IN
      SELECT e.*
      FROM public.stock_movements e
      WHERE e.order_id=p_order_id
        AND e.tipo='egreso'
        AND NOT EXISTS(
          SELECT 1 FROM public.stock_movements rv
          WHERE rv.reversa_de_movimiento_id=e.id
        )
      ORDER BY e.created_at
    LOOP
      BEGIN
        PERFORM public.adjust_store_stock(
          m.product_id,m.variante,m.cantidad,
          'Anulación pedido #'||v_order.order_number||COALESCE(' — '||NULLIF(p_reason,''),''),
          p_order_id,p_user_id,m.order_item_id,m.id,false
        );
        v_rev:=v_rev+1;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END IF;

  UPDATE public.store_orders
  SET status='cancelado',
      cancelled_at=COALESCE(cancelled_at,now()),
      cancel_reason=COALESCE(NULLIF(p_reason,''),cancel_reason),
      stock_restored_at=CASE
        WHEN v_deferred THEN NULL
        WHEN v_rev>0 THEN now()
        ELSE stock_restored_at
      END,
      updated_at=now()
  WHERE id=p_order_id;

  RETURN jsonb_build_object(
    'ok',true,'order_id',p_order_id,'reversas',v_rev,'retorno_pendiente',v_deferred
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_cancelled_store_order_return(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_order public.store_orders%ROWTYPE;
  m RECORD;
  v_rev int:=0;
BEGIN
  IF NOT (
    public.has_role(v_uid,'admin'::app_role)
    OR public.has_role(v_uid,'deposito'::app_role)
    OR public.is_super_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_order
  FROM public.store_orders
  WHERE id=_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_order.status<>'cancelado' THEN RAISE EXCEPTION 'El pedido no está cancelado'; END IF;
  IF v_order.stock_restored_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'ya_retornado',true,'reversas',0);
  END IF;

  UPDATE public.vehiculo_carga_items vci
  SET estado='retornado'
  WHERE vci.source_table='store_order_items'
    AND vci.source_id IN (
      SELECT id FROM public.store_order_items WHERE order_id=_order_id
    )
    AND vci.estado='cargado';

  FOR m IN
    SELECT e.*
    FROM public.stock_movements e
    WHERE e.order_id=_order_id
      AND e.tipo='egreso'
      AND NOT EXISTS(
        SELECT 1 FROM public.stock_movements rv
        WHERE rv.reversa_de_movimiento_id=e.id
      )
    ORDER BY e.created_at
  LOOP
    BEGIN
      PERFORM public.adjust_store_stock(
        m.product_id,m.variante,m.cantidad,
        'Retorno físico pedido cancelado #'||v_order.order_number,
        _order_id,v_uid,m.order_item_id,m.id,false
      );
      v_rev:=v_rev+1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

  UPDATE public.store_orders
  SET stock_restored_at=now(),updated_at=now()
  WHERE id=_order_id;

  RETURN jsonb_build_object('ok',true,'order_id',_order_id,'reversas',v_rev);
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.store_products
    WHERE is_combo=true AND is_preorder=false
  LOOP
    PERFORM public.refresh_combo_stock(r.id);
  END LOOP;
END $$;
