-- ============================================================
-- A) adjust_store_stock: prohibido dejar stock negativo en egresos
-- ============================================================
CREATE OR REPLACE FUNCTION public.adjust_store_stock(
  p_product_id uuid, p_key text, p_delta integer, p_motivo text,
  p_order_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid,
  p_order_item_id uuid DEFAULT NULL::uuid, p_reversa_de uuid DEFAULT NULL::uuid,
  p_strict boolean DEFAULT false, p_metodo cambio_metodo DEFAULT NULL::cambio_metodo,
  p_cambio_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old int; v_new int; v_stock jsonb; v_id uuid; v_motivo text := p_motivo;
BEGIN
  IF p_product_id IS NULL OR p_delta = 0 THEN RETURN NULL; END IF;

  IF p_key IS NULL THEN
    SELECT COALESCE(stock,0) INTO v_old FROM public.store_products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSE
    SELECT COALESCE(variant_stock,'{}'::jsonb) INTO v_stock
      FROM public.store_products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_old := COALESCE((v_stock->>p_key)::int, 0);
  END IF;

  v_new := v_old + p_delta;

  -- Regla dura: un egreso NUNCA puede dejar el stock en negativo.
  -- Los ingresos y reversas siguen permitidos aunque el stock esté negativo.
  IF p_delta < 0 AND v_new < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', GREATEST(v_old,0), abs(p_delta)
      USING ERRCODE = '23514';
  END IF;

  IF p_key IS NULL THEN
    UPDATE public.store_products SET stock = v_new, updated_at = now() WHERE id = p_product_id;
  ELSE
    UPDATE public.store_products
       SET variant_stock = jsonb_set(v_stock, ARRAY[p_key], to_jsonb(v_new), true),
           updated_at = now()
     WHERE id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements(
    product_id, tipo, cantidad, stock_anterior, stock_nuevo,
    motivo, registrado_por, variante, order_id, order_item_id,
    reversa_de_movimiento_id, metodo, cambio_id
  ) VALUES (
    p_product_id,
    CASE WHEN p_delta >= 0 THEN 'ingreso' ELSE 'egreso' END,
    abs(p_delta), v_old, v_new, v_motivo, p_user_id, p_key, p_order_id, p_order_item_id,
    p_reversa_de, p_metodo, p_cambio_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public._stock_disponible(p_product_id uuid, p_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_stock jsonb; v_val int;
BEGIN
  IF p_key IS NULL THEN
    SELECT COALESCE(stock,0) INTO v_val FROM public.store_products WHERE id = p_product_id FOR UPDATE;
    RETURN COALESCE(v_val,0);
  END IF;
  SELECT COALESCE(variant_stock,'{}'::jsonb) INTO v_stock FROM public.store_products WHERE id = p_product_id FOR UPDATE;
  RETURN COALESCE((v_stock->>p_key)::int, 0);
END;
$function$;

-- ============================================================
-- A.2) Trigger de egreso por venta: valida TODOS los componentes
--      del combo antes de descontar (evita egresos parciales)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_store_order_stock_egreso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD; c RECORD; v_key text; v_is_combo boolean; v_direct text;
  v_qty int; v_disp int; v_nombre text;
BEGIN
  IF NOT public.store_order_compromete_stock(NEW.status) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND public.store_order_compromete_stock(OLD.status) THEN RETURN NEW; END IF;

  FOR r IN SELECT oi.id,oi.product_id,oi.quantity,oi.variant_selection FROM public.store_order_items oi WHERE oi.order_id=NEW.id AND oi.product_id IS NOT NULL LOOP
    SELECT COALESCE(is_combo,false) INTO v_is_combo FROM public.store_products WHERE id=r.product_id;
    v_qty := GREATEST(COALESCE(r.quantity,1),0);

    IF v_is_combo THEN
      FOR c IN SELECT * FROM public.store_combo_items WHERE combo_id=r.product_id AND obligatorio=true AND component_product_id IS NOT NULL ORDER BY sort_order LOOP
        CONTINUE WHEN EXISTS(SELECT 1 FROM public.stock_movements WHERE order_item_id=r.id AND product_id=c.component_product_id AND tipo='egreso');
        v_key := public._build_variant_key(c.component_product_id,COALESCE(r.variant_selection,'{}'::jsonb));
        IF v_key IS NULL THEN
          v_direct := COALESCE(r.variant_selection->>c.component_product_id::text,'');
          IF v_direct<>'' THEN v_key := public.resolve_variant_key(c.component_product_id,v_direct); END IF;
        END IF;
        v_disp := public._stock_disponible(c.component_product_id, v_key);
        IF v_qty > 0 AND v_disp < v_qty THEN
          SELECT name INTO v_nombre FROM public.store_products WHERE id=c.component_product_id;
          RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado % (componente % del combo)', GREATEST(v_disp,0), v_qty, COALESCE(v_nombre,'?')
            USING ERRCODE = '23514';
        END IF;
      END LOOP;

      FOR c IN SELECT * FROM public.store_combo_items WHERE combo_id=r.product_id AND obligatorio=true AND component_product_id IS NOT NULL ORDER BY sort_order LOOP
        CONTINUE WHEN EXISTS(SELECT 1 FROM public.stock_movements WHERE order_item_id=r.id AND product_id=c.component_product_id AND tipo='egreso');
        v_key := public._build_variant_key(c.component_product_id,COALESCE(r.variant_selection,'{}'::jsonb));
        IF v_key IS NULL THEN
          v_direct := COALESCE(r.variant_selection->>c.component_product_id::text,'');
          IF v_direct<>'' THEN v_key := public.resolve_variant_key(c.component_product_id,v_direct); END IF;
        END IF;
        BEGIN
          PERFORM public.adjust_store_stock(c.component_product_id,v_key,-v_qty,
            'Venta combo pedido #'||NEW.order_number,NEW.id,auth.uid(),r.id,NULL,false);
        EXCEPTION WHEN unique_violation THEN NULL; END;
      END LOOP;
    ELSE
      CONTINUE WHEN EXISTS(SELECT 1 FROM public.stock_movements WHERE order_item_id=r.id AND product_id=r.product_id AND tipo='egreso');
      v_key := public._build_variant_key(r.product_id,COALESCE(r.variant_selection,'{}'::jsonb));
      BEGIN
        PERFORM public.adjust_store_stock(r.product_id,v_key,-v_qty,
          'Venta pedido #'||NEW.order_number,NEW.id,auth.uid(),r.id,NULL,false);
      EXCEPTION WHEN unique_violation THEN NULL; END;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- B) Sustitución por falta de stock (sobre store_cambios)
-- ============================================================
ALTER TABLE public.store_cambios
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.store_order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS precio_cobrado_original numeric,
  ADD COLUMN IF NOT EXISTS precio_reemplazo numeric,
  ADD COLUMN IF NOT EXISTS resolucion_economica text,
  ADD COLUMN IF NOT EXISTS monto_absorbido numeric,
  ADD COLUMN IF NOT EXISTS cuenta_ajuste_id uuid REFERENCES public.cuenta_ajustes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS devolucion_id uuid REFERENCES public.devoluciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversa_movimiento_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS egreso_reemplazo_movimiento_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.store_cambios.resolucion_economica IS
  'sin_ajuste | cobrar_diferencia | absorbe_reybaud | saldo_a_favor | devolucion (solo para tipo=sustitucion_falta_stock)';

CREATE UNIQUE INDEX IF NOT EXISTS store_cambios_sustitucion_item_uniq
  ON public.store_cambios(order_item_id)
  WHERE tipo = 'sustitucion_falta_stock' AND estado <> 'cancelado'::cambio_estado;

CREATE OR REPLACE FUNCTION public.resolver_falta_stock(
  p_order_item_id uuid,
  p_producto_reemplazo_id uuid,
  p_variante_destino jsonb DEFAULT '{}'::jsonb,
  p_resolucion text DEFAULT 'sin_ajuste',
  p_comentario text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.store_order_items%ROWTYPE;
  v_order public.store_orders%ROWTYPE;
  v_prod public.store_products%ROWTYPE;
  v_qty int; v_precio_orig numeric; v_precio_reem numeric; v_dif numeric;
  v_mov RECORD; v_reversa uuid; v_egreso uuid; v_key text;
  v_cambio_id uuid; v_ajuste_id uuid; v_absorbido numeric;
BEGIN
  IF NOT (public.has_role(v_uid,'admin'::app_role) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Solo admin puede resolver una falta de stock';
  END IF;

  SELECT * INTO v_item FROM public.store_order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La línea del pedido no existe'; END IF;

  SELECT * INTO v_order FROM public.store_orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe'; END IF;
  IF v_order.status IN ('cancelado','cancelada') THEN RAISE EXCEPTION 'El pedido está cancelado'; END IF;
  IF v_order.status = 'entregado' THEN RAISE EXCEPTION 'El pedido ya fue entregado: usá el flujo de cambio'; END IF;
  IF v_order.alumno_id IS NULL THEN RAISE EXCEPTION 'El pedido no está asociado a un alumno'; END IF;

  IF EXISTS (SELECT 1 FROM public.store_cambios sc
              WHERE sc.order_item_id = p_order_item_id
                AND sc.tipo = 'sustitucion_falta_stock'
                AND sc.estado <> 'cancelado'::cambio_estado) THEN
    RAISE EXCEPTION 'Esta línea ya tiene una sustitución por falta de stock';
  END IF;

  SELECT * INTO v_prod FROM public.store_products WHERE id = p_producto_reemplazo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto de reemplazo no existe'; END IF;
  IF COALESCE(v_prod.currency,'ARS') <> COALESCE(v_order.currency,'ARS') THEN
    RAISE EXCEPTION 'El reemplazo está en otra moneda que el pedido';
  END IF;

  v_qty := GREATEST(COALESCE(v_item.quantity,1),1);
  v_precio_orig := ROUND(COALESCE(v_item.precio_cobrado, v_item.unit_price, 0)::numeric * v_qty, 2);
  v_precio_reem := ROUND(COALESCE(v_prod.price,0)::numeric * v_qty, 2);
  v_dif := ROUND(v_precio_reem - v_precio_orig, 2);

  IF v_dif > 0.009 AND p_resolucion NOT IN ('cobrar_diferencia','absorbe_reybaud') THEN
    RAISE EXCEPTION 'El reemplazo es más caro: elegí cobrar la diferencia o absorberla';
  ELSIF v_dif < -0.009 AND p_resolucion NOT IN ('saldo_a_favor','devolucion') THEN
    RAISE EXCEPTION 'El reemplazo es más barato: elegí saldo a favor o devolución';
  ELSIF abs(v_dif) <= 0.009 AND p_resolucion <> 'sin_ajuste' THEN
    RAISE EXCEPTION 'Los precios coinciden: no corresponde ajuste económico';
  END IF;

  SELECT e.* INTO v_mov FROM public.stock_movements e
   WHERE e.order_item_id = p_order_item_id AND e.tipo = 'egreso'
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements rv WHERE rv.reversa_de_movimiento_id = e.id)
   ORDER BY e.created_at LIMIT 1;

  IF FOUND THEN
    v_reversa := public.adjust_store_stock(
      v_mov.product_id, v_mov.variante, v_mov.cantidad,
      'Sustitución por falta de stock · original no entregado (pedido #'||v_order.order_number||')',
      v_order.id, v_uid, v_mov.order_item_id, v_mov.id, false);
  END IF;

  v_key := public._build_variant_key(p_producto_reemplazo_id, COALESCE(p_variante_destino,'{}'::jsonb));
  v_egreso := public.adjust_store_stock(
    p_producto_reemplazo_id, v_key, -v_qty,
    'Reemplazo por falta de stock (pedido #'||v_order.order_number||')',
    v_order.id, v_uid, p_order_item_id, NULL, true);
  IF v_egreso IS NULL THEN
    RAISE EXCEPTION 'No se pudo descontar el reemplazo';
  END IF;

  IF p_resolucion = 'cobrar_diferencia' THEN
    INSERT INTO public.cuenta_ajustes(alumno_id, tipo, concepto, monto, moneda, fecha, notas,
      created_by, aplicado_a_fuente_tabla, aplicado_a_fuente_id)
    VALUES (v_order.alumno_id, 'cargo',
      'Diferencia por sustitución falta de stock · pedido #'||v_order.order_number,
      abs(v_dif), COALESCE(v_order.currency,'ARS'), CURRENT_DATE, p_comentario,
      v_uid, 'store_orders', v_order.id)
    RETURNING id INTO v_ajuste_id;
  ELSIF p_resolucion = 'saldo_a_favor' THEN
    INSERT INTO public.cuenta_ajustes(alumno_id, tipo, concepto, monto, moneda, fecha, notas,
      created_by, aplicado_a_fuente_tabla, aplicado_a_fuente_id)
    VALUES (v_order.alumno_id, 'credito',
      'Saldo a favor por sustitución falta de stock · pedido #'||v_order.order_number,
      abs(v_dif), COALESCE(v_order.currency,'ARS'), CURRENT_DATE, p_comentario,
      v_uid, 'store_orders', v_order.id)
    RETURNING id INTO v_ajuste_id;
  ELSIF p_resolucion = 'absorbe_reybaud' THEN
    v_absorbido := abs(v_dif);
  END IF;

  INSERT INTO public.store_cambios (
    alumno_id, producto_id, origen_tipo, order_id, order_item_id,
    variante_origen, variante_destino, motivo, comentario, estado, tipo,
    iniciado_por, admin_iniciador_id, responsable_admin_id, origen_solicitud, notificar_alumno,
    producto_reemplazo_id, reemplazo_estado, moneda, diferencia_precio,
    precio_cobrado_original, precio_reemplazo, resolucion_economica, monto_absorbido,
    cuenta_ajuste_id, reversa_movimiento_id, egreso_reemplazo_movimiento_id,
    stock_devuelto_at, stock_descontado_at, motivo_admin, historial
  ) VALUES (
    v_order.alumno_id, v_item.product_id, 'compra', v_order.id, p_order_item_id,
    COALESCE(v_item.variant_selection,'{}'::jsonb), COALESCE(p_variante_destino,'{}'::jsonb),
    'otro'::cambio_motivo, p_comentario, 'aprobado'::cambio_estado, 'sustitucion_falta_stock',
    'admin'::cambio_iniciador, v_uid, v_uid, 'presencial'::cambio_origen, false,
    p_producto_reemplazo_id, 'pendiente_envio'::cambio_reemplazo_estado,
    COALESCE(v_order.currency,'ARS'), v_dif,
    v_precio_orig, v_precio_reem, p_resolucion, v_absorbido,
    v_ajuste_id, v_reversa, v_egreso,
    CASE WHEN v_reversa IS NOT NULL THEN now() END, now(),
    'falta_stock',
    jsonb_build_array(jsonb_build_object(
      'estado','sustitucion_falta_stock','at',now(),'by',v_uid,
      'nota','Original no entregado por falta de stock',
      'resolucion',p_resolucion,'diferencia',v_dif))
  ) RETURNING id INTO v_cambio_id;

  IF v_ajuste_id IS NOT NULL THEN
    UPDATE public.cuenta_ajustes SET referencia_externa = 'store_cambio:'||v_cambio_id WHERE id = v_ajuste_id;
  END IF;

  INSERT INTO public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  VALUES (v_uid, 'admin', 'resolver_falta_stock', 'store_cambios', v_cambio_id::text,
    jsonb_build_object(
      'order_id', v_order.id, 'order_number', v_order.order_number,
      'order_item_id', p_order_item_id,
      'producto_original', v_item.product_id, 'variante_origen', v_item.variant_selection,
      'producto_reemplazo', p_producto_reemplazo_id, 'variante_destino', p_variante_destino,
      'cantidad', v_qty,
      'precio_cobrado_original', v_precio_orig, 'precio_reemplazo', v_precio_reem,
      'diferencia', v_dif, 'resolucion', p_resolucion,
      'cuenta_ajuste_id', v_ajuste_id, 'monto_absorbido', v_absorbido,
      'reversa_movimiento_id', v_reversa, 'egreso_reemplazo_movimiento_id', v_egreso));

  RETURN v_cambio_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolver_falta_stock(uuid, uuid, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolver_falta_stock(uuid, uuid, jsonb, text, text) TO authenticated;

-- ============================================================
-- C) Panel de inconsistencias: stock negativo con causa
-- ============================================================
CREATE OR REPLACE VIEW public.vw_stock_negativo AS
WITH neg AS (
  SELECT p.id AS product_id, p.name AS producto, kv.key AS variante,
         (kv.value)::text::int AS stock
    FROM public.store_products p
    CROSS JOIN LATERAL jsonb_each(COALESCE(p.variant_stock,'{}'::jsonb)) kv
   WHERE (kv.value)::text::int < 0
  UNION ALL
  SELECT p.id, p.name, NULL::text, COALESCE(p.stock,0)
    FROM public.store_products p
   WHERE COALESCE(p.stock,0) < 0
     AND COALESCE(p.variant_stock,'{}'::jsonb) = '{}'::jsonb
)
SELECT n.product_id, n.producto, n.variante, n.stock,
       m.id AS movimiento_id, m.created_at AS fecha, m.motivo,
       m.order_id, o.order_number, o.status AS order_status,
       o.alumno_id, m.order_item_id,
       CASE
         WHEN o.id IS NOT NULL AND o.status NOT IN ('cancelado','cancelada','entregado')
           THEN 'Resolver falta de stock (sustitución) desde el pedido'
         WHEN o.id IS NOT NULL AND o.status = 'entregado'
           THEN 'Mercadería entregada: ajustar stock por conteo/ingreso'
         ELSE 'Revisar con un conteo de depósito'
       END AS accion_sugerida
  FROM neg n
  LEFT JOIN LATERAL (
    SELECT sm.* FROM public.stock_movements sm
     WHERE sm.product_id = n.product_id
       AND sm.tipo = 'egreso'
       AND COALESCE(sm.variante,'') = COALESCE(n.variante,'')
       AND sm.stock_nuevo < 0
     ORDER BY sm.created_at DESC LIMIT 1
  ) m ON true
  LEFT JOIN public.store_orders o ON o.id = m.order_id;

GRANT SELECT ON public.vw_stock_negativo TO authenticated;