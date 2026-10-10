-- Cambios: crear SIEMPRE a partir de una venta real y su artículo vendido.
-- No modifica inventario; recepción y preparación continúan en sus RPCs separadas.
CREATE OR REPLACE FUNCTION public.admin_crear_cambio_desde_venta(
 p_origen_tipo text,
 p_order_item_id uuid,
 p_preorder_id uuid,
 p_producto_reemplazo_id uuid,
 p_variante_destino jsonb,
 p_motivo public.cambio_motivo,
 p_comentario text,
 p_motivo_admin text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_order public.store_orders%ROWTYPE;
  v_item public.store_order_items%ROWTYPE;
  v_preorder public.store_preorders%ROWTYPE;
  v_replacement public.store_products%ROWTYPE;
  v_original_producto uuid;
  v_original_variante jsonb;
  v_precio_original numeric;
  v_alumno uuid;
  v_moneda text;
  v_order_id uuid;
  v_preorder_id uuid;
  v_id uuid;
  v_duplicates int;
  v_variant_specs jsonb;
  v_spec jsonb;
  v_destino jsonb := COALESCE(p_variante_destino,'{}'::jsonb);
  v_diff numeric;
BEGIN
  IF v_usuario IS NULL OR NOT public.has_role(v_usuario,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo administración puede crear cambios en nombre del alumno';
  END IF;
  IF length(trim(coalesce(p_motivo_admin,''))) < 3 THEN
    RAISE EXCEPTION 'Indicá el motivo administrativo';
  END IF;
  IF p_origen_tipo NOT IN ('compra','preorder') THEN
    RAISE EXCEPTION 'El cambio debe originarse en una venta existente';
  END IF;

  IF p_origen_tipo='compra' THEN
    IF p_order_item_id IS NULL OR p_preorder_id IS NOT NULL THEN
      RAISE EXCEPTION 'Seleccioná una prenda vendida de un pedido de tienda';
    END IF;
    SELECT * INTO v_item FROM public.store_order_items WHERE id=p_order_item_id;
    IF NOT FOUND OR v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'No encontramos la prenda vendida';
    END IF;
    SELECT * INTO v_order FROM public.store_orders WHERE id=v_item.order_id;
    IF NOT FOUND OR v_order.alumno_id IS NULL THEN
      RAISE EXCEPTION 'La venta debe estar asociada a un alumno antes de crear un cambio';
    END IF;
    IF v_order.status NOT IN
      ('pagado','pendiente_pago_efectivo','preparando','en_camioneta','enviado','listo_retiro','entregado') THEN
      RAISE EXCEPTION 'La venta no está confirmada (estado %)',v_order.status;
    END IF;
    v_order_id := v_order.id;
    v_original_producto := v_item.product_id;
    v_original_variante := COALESCE(v_item.variant_selection,'{}'::jsonb);
    v_alumno := v_order.alumno_id;
    v_precio_original := COALESCE(v_item.precio_cobrado,v_item.unit_price,0);
    v_moneda := v_order.currency;
  ELSE
    IF p_preorder_id IS NULL OR p_order_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'Seleccioná una preventa ya realizada';
    END IF;
    SELECT * INTO v_preorder FROM public.store_preorders WHERE id=p_preorder_id;
    IF NOT FOUND OR v_preorder.alumno_id IS NULL OR v_preorder.product_id IS NULL THEN
      RAISE EXCEPTION 'La preventa no tiene un alumno y producto vinculados';
    END IF;
    IF v_preorder.estado NOT IN ('entregada','lista_para_retirar') THEN
      RAISE EXCEPTION 'La preventa no se encuentra entregada ni lista para retirar (estado %)',v_preorder.estado;
    END IF;
    v_preorder_id := v_preorder.id;
    v_original_producto := v_preorder.product_id;
    v_original_variante := COALESCE(v_preorder.variante,'{}'::jsonb);
    v_alumno := v_preorder.alumno_id;
    v_precio_original := COALESCE(v_preorder.precio_unitario,0);
    v_moneda := v_preorder.moneda;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.alumnos WHERE id=v_alumno) THEN
    RAISE EXCEPTION 'El alumno asociado a la venta ya no existe';
  END IF;
  SELECT * INTO v_replacement FROM public.store_products WHERE id=p_producto_reemplazo_id;
  IF NOT FOUND OR v_replacement.status<>'active' THEN
    RAISE EXCEPTION 'El producto de reemplazo no está disponible';
  END IF;
  IF v_moneda IS NOT NULL AND v_replacement.currency IS NOT NULL
    AND v_moneda<>v_replacement.currency THEN
    RAISE EXCEPTION 'El producto de reemplazo tiene una moneda diferente a la venta';
  END IF;
  IF jsonb_typeof(v_destino)<>'object' THEN
    RAISE EXCEPTION 'La variante debe ser un objeto con talle y color';
  END IF;
  v_variant_specs := v_replacement.variants;
  IF jsonb_typeof(v_variant_specs)='array' THEN
    FOR v_spec IN SELECT value FROM jsonb_array_elements(v_variant_specs) LOOP
      IF jsonb_typeof(v_spec->'options')='array'
        AND jsonb_array_length(v_spec->'options')>0 AND (
        nullif(trim(coalesce(v_destino->>(v_spec->>'name'),'')),'') IS NULL OR
        NOT EXISTS(
          SELECT 1 FROM jsonb_array_elements_text(v_spec->'options') x
          WHERE x=v_destino->>(v_spec->>'name')
        )
      ) THEN RAISE EXCEPTION 'Elegí un valor válido para %',v_spec->>'name'; END IF;
    END LOOP;
  END IF;
  IF p_producto_reemplazo_id=v_original_producto AND v_original_variante=v_destino THEN
    RAISE EXCEPTION 'Elegí un talle/color distinto del comprado o un producto diferente';
  END IF;
  SELECT count(*) INTO v_duplicates FROM public.store_cambios c
  WHERE c.tipo='cambio'
    AND c.estado IN ('solicitado','aprobado','en_deposito','listo_retiro','devolucion_solicitada')
    AND ( (p_origen_tipo='compra' AND (
             c.order_item_id=p_order_item_id OR (
              c.order_item_id IS NULL AND c.order_id=v_order_id
              AND c.producto_id=v_original_producto
              AND COALESCE(c.variante_origen,'{}'::jsonb)=v_original_variante
             )
           ))
       OR (p_origen_tipo='preorder' AND c.preorder_id=p_preorder_id) );
  IF v_duplicates>0 THEN
    RAISE EXCEPTION 'Esta prenda ya tiene un cambio abierto';
  END IF;

  v_diff := COALESCE(v_replacement.price,0)-COALESCE(v_precio_original,0);
  INSERT INTO public.store_cambios (
    alumno_id,producto_id,origen_tipo,compra_id,preorder_id,order_id,order_item_id,
    variante_origen,variante_destino,producto_reemplazo_id,motivo,comentario,tipo,
    iniciado_por,admin_iniciador_id,motivo_admin,origen_solicitud,
    estado,aprobado_at,historial,
    precio_cobrado_original,precio_reemplazo,diferencia_precio,moneda,estado_pago_diferencia
  ) VALUES (
    v_alumno,v_original_producto,p_origen_tipo,v_order_id,v_preorder_id,v_order_id,p_order_item_id,
    v_original_variante,v_destino,CASE WHEN p_producto_reemplazo_id<>v_original_producto THEN p_producto_reemplazo_id ELSE NULL END,
    p_motivo,p_comentario,'cambio',
    'admin',v_usuario,p_motivo_admin,'presencial',
    'aprobado',now(),
    jsonb_build_array(jsonb_build_object('estado','aprobado','evento','cambio_desde_venta',
      'at',now(),'by',v_usuario,'venta_id',coalesce(v_order_id,v_preorder_id),
      'order_item_id',p_order_item_id,'nota','Autorizado; devolución física aún pendiente')),
    v_precio_original,v_replacement.price,v_diff,v_moneda,
    CASE WHEN v_diff>0 THEN 'pendiente' ELSE 'no_aplica' END
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Las llamadas anteriores siguen funcionando solo si identifican una venta real.
CREATE OR REPLACE FUNCTION public.admin_create_cambio_indumentaria(
 p_alumno_id uuid,p_producto_id uuid,p_origen_tipo text,p_compra_id uuid,p_preorder_id uuid,
 p_variante_origen jsonb,p_variante_destino jsonb,p_motivo public.cambio_motivo,
 p_comentario text,p_motivo_admin text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_item uuid; v_venta_alumno uuid; v_original jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;
  IF p_origen_tipo='compra' THEN
    SELECT o.alumno_id INTO v_venta_alumno
    FROM public.store_orders o WHERE o.id=p_compra_id;
    IF v_venta_alumno IS DISTINCT FROM p_alumno_id THEN
      RAISE EXCEPTION 'El alumno elegido no corresponde a la venta';
    END IF;
    SELECT oi.id,oi.variant_selection INTO v_item,v_original
    FROM public.store_order_items oi WHERE oi.order_id=p_compra_id
      AND oi.product_id=p_producto_id AND
      COALESCE(oi.variant_selection,'{}'::jsonb)=COALESCE(p_variante_origen,'{}'::jsonb)
    ORDER BY oi.created_at LIMIT 1;
    IF v_item IS NULL THEN RAISE EXCEPTION 'Seleccioná una prenda existente de la venta'; END IF;
  ELSIF p_origen_tipo='preorder' THEN
    SELECT pre.alumno_id,pre.variante INTO v_venta_alumno,v_original
    FROM public.store_preorders pre WHERE pre.id=p_preorder_id AND pre.product_id=p_producto_id;
    IF v_venta_alumno IS NULL OR v_venta_alumno IS DISTINCT FROM p_alumno_id OR
      COALESCE(v_original,'{}'::jsonb)<>COALESCE(p_variante_origen,'{}'::jsonb) THEN
      RAISE EXCEPTION 'Elegí la preventa concreta correspondiente al alumno y la prenda';
    END IF;
  ELSE
    RAISE EXCEPTION 'Es obligatorio seleccionar una venta existente';
  END IF;
  RETURN public.admin_crear_cambio_desde_venta(
    p_origen_tipo,v_item,p_preorder_id,p_producto_id,p_variante_destino,
    p_motivo,p_comentario,p_motivo_admin
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_crear_cambio_desde_venta(text,uuid,uuid,uuid,jsonb,public.cambio_motivo,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_crear_cambio_desde_venta(text,uuid,uuid,uuid,jsonb,public.cambio_motivo,text,text) TO authenticated,service_role;

-- Una prueba puede vincularse a una venta o directamente a un alumno. Si aporta los
-- dos identificadores, deben referirse al mismo cliente.
CREATE OR REPLACE FUNCTION public.crear_prenda_prueba(
 p_producto_id uuid,p_variante jsonb DEFAULT '{}'::jsonb,p_order_id uuid DEFAULT NULL,
 p_alumno_id uuid DEFAULT NULL,p_comentario text DEFAULT NULL,
 p_metodo public.cambio_metodo DEFAULT 'manual'::public.cambio_metodo,
 p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_alumno uuid:=p_alumno_id; v_key text; v_venta_alumno uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'Falta el producto'; END IF;
  IF p_order_id IS NOT NULL THEN
    SELECT alumno_id INTO v_venta_alumno FROM public.store_orders
    WHERE id=p_order_id AND status<>'cancelado';
    IF v_venta_alumno IS NULL THEN
      RAISE EXCEPTION 'Seleccioná una venta válida asociada a un alumno';
    END IF;
    IF v_alumno IS NOT NULL AND v_alumno<>v_venta_alumno THEN
      RAISE EXCEPTION 'La venta y el alumno no coinciden';
    END IF;
    v_alumno:=v_venta_alumno;
  END IF;
  IF v_alumno IS NULL OR NOT EXISTS (SELECT 1 FROM public.alumnos WHERE id=v_alumno) THEN
    RAISE EXCEPTION 'La prueba debe estar asociada a un alumno';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.store_cambios WHERE prueba_idempotency_key=p_idempotency_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  BEGIN
    INSERT INTO public.store_cambios (
      alumno_id,producto_id,origen_tipo,order_id,variante_origen,variante_destino,
      motivo,comentario,estado,tipo,prueba_resultado,prueba_salida_at,
      iniciado_por,admin_iniciador_id,origen_solicitud,notificar_alumno,prueba_idempotency_key,
      historial
    ) VALUES (
      v_alumno,p_producto_id,'compra',p_order_id,COALESCE(p_variante,'{}'::jsonb),NULL,
      'otro'::public.cambio_motivo,p_comentario,'listo_retiro'::public.cambio_estado,'prueba','pendiente',now(),
      'admin'::public.cambio_iniciador,auth.uid(),'presencial'::public.cambio_origen,false,p_idempotency_key,
      jsonb_build_array(jsonb_build_object('evento','prueba_enviada','at',now(),'by',auth.uid(),
        'origen',CASE WHEN p_order_id IS NOT NULL THEN 'venta' ELSE 'alumno' END))
    ) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.store_cambios WHERE prueba_idempotency_key=p_idempotency_key;
    IF v_id IS NULL THEN RAISE; END IF;
    RETURN v_id;
  END;
  v_key:=public._build_variant_key(p_producto_id,COALESCE(p_variante,'{}'::jsonb));
  PERFORM public.adjust_store_stock(
    p_producto_id,v_key,-1,'prueba_out (prenda enviada a prueba)',
    p_order_id,auth.uid(),NULL,NULL,false,p_metodo,v_id
  );
  UPDATE public.store_cambios
  SET stock_descontado_at=now() WHERE id=v_id;
  RETURN v_id;
END;
$$;

-- No se permiten solicitudes desde la app sin acreditar el artículo comprado.
CREATE OR REPLACE FUNCTION public.request_cambio_indumentaria(p_producto_id uuid, p_origen_tipo text, p_compra_id uuid, p_preorder_id uuid, p_variante_origen jsonb, p_variante_destino jsonb, p_motivo cambio_motivo, p_comentario text, p_fotos text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alumno_id uuid;
  v_producto record;
  v_id uuid;
  v_existing int;
  v_order_status text;
  v_estado text;
  v_historial jsonb;
  v_variant_stock jsonb;
  v_has_stock boolean := true;
  v_min_stock int;
  v_k text;
  v_v text;
  v_q int;
BEGIN
  SELECT id INTO v_alumno_id FROM public.alumnos WHERE user_id = auth.uid() LIMIT 1;
  IF v_alumno_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  -- La solicitud del alumno también debe identificar una compra real, no solo un producto.
  IF p_origen_tipo='compra' THEN
    IF p_compra_id IS NULL OR p_preorder_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.store_orders o
      JOIN public.store_order_items i ON i.order_id=o.id
      WHERE o.id=p_compra_id AND o.alumno_id=v_alumno_id
        AND i.product_id=p_producto_id
        AND COALESCE(i.variant_selection,'{}'::jsonb)=COALESCE(p_variante_origen,'{}'::jsonb)
        AND o.status NOT IN ('cancelado','pendiente','pendiente_pago')
    ) THEN
      RAISE EXCEPTION 'Para solicitar un cambio seleccioná una prenda de una venta real';
    END IF;
  ELSIF p_origen_tipo='preorder' THEN
    IF p_preorder_id IS NULL OR p_compra_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.store_preorders o
      WHERE o.id=p_preorder_id AND o.alumno_id=v_alumno_id
        AND o.product_id=p_producto_id
        AND COALESCE(o.variante,'{}'::jsonb)=COALESCE(p_variante_origen,'{}'::jsonb)
        AND o.estado IN ('entregada','lista_para_retirar')
    ) THEN
      RAISE EXCEPTION 'Para solicitar un cambio seleccioná una preventa real';
    END IF;
  ELSE
    RAISE EXCEPTION 'El cambio requiere una venta o preventa asociada';
  END IF;

  SELECT * INTO v_producto FROM public.store_products WHERE id = p_producto_id;
  IF v_producto IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_producto.no_admite_cambio THEN RAISE EXCEPTION 'Este producto no admite cambios'; END IF;

  IF p_origen_tipo = 'compra' AND p_compra_id IS NOT NULL THEN
    SELECT status INTO v_order_status FROM public.store_orders
      WHERE id = p_compra_id AND alumno_id = v_alumno_id;
    IF v_order_status IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
    IF v_order_status NOT IN ('pagado','pendiente_pago_efectivo','preparando','enviado','entregado') THEN
      RAISE EXCEPTION 'No se puede solicitar cambio con el pedido en estado %', v_order_status;
    END IF;
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.store_cambios
  WHERE alumno_id = v_alumno_id
    AND producto_id = p_producto_id
    AND estado IN ('solicitado','aprobado','en_deposito','listo_retiro','devolucion_solicitada');
  IF v_existing > 0 THEN RAISE EXCEPTION 'Ya tenés una solicitud de cambio abierta para este producto'; END IF;

  -- Decidir estado inicial
  IF p_variante_destino IS NULL THEN
    v_estado := 'devolucion_solicitada';
  ELSE
    -- Chequear stock de la variante destino contra variant_stock del producto
    v_variant_stock := COALESCE(v_producto.variant_stock, '{}'::jsonb);
    v_min_stock := NULL;
    FOR v_k, v_v IN SELECT key, value::text FROM jsonb_each_text(p_variante_destino) LOOP
      -- value llega con comillas dobles; jsonb_each_text ya las quita
      v_q := NULLIF(v_variant_stock ->> (v_k || ':' || v_v), '')::int;
      IF v_q IS NULL THEN
        -- sin info de stock para ese atributo → tratamos como sin stock para forzar revisión admin
        v_has_stock := false;
        EXIT;
      END IF;
      IF v_min_stock IS NULL OR v_q < v_min_stock THEN v_min_stock := v_q; END IF;
    END LOOP;
    IF v_has_stock AND (v_min_stock IS NULL OR v_min_stock <= 0) THEN
      v_has_stock := false;
    END IF;

    IF v_has_stock THEN
      v_estado := 'aprobado';
    ELSE
      v_estado := 'solicitado';
    END IF;
  END IF;

  v_historial := jsonb_build_array(
    jsonb_build_object(
      'estado', v_estado, 'at', now(), 'by', 'alumno',
      'nota', CASE
                WHEN v_estado = 'aprobado' THEN 'Auto-aprobado: hay stock del talle elegido'
                WHEN v_estado = 'solicitado' THEN 'Sin stock del talle elegido — requiere autorización de administración'
                ELSE 'Solicitud de devolución'
              END
    )
  );

  INSERT INTO public.store_cambios (
    alumno_id, producto_id, origen_tipo, compra_id, preorder_id, order_id,
    variante_origen, variante_destino, motivo, comentario, fotos,
    iniciado_por, origen_solicitud, estado, aprobado_at, historial
  ) VALUES (
    v_alumno_id, p_producto_id, p_origen_tipo, p_compra_id, p_preorder_id,
    CASE WHEN p_origen_tipo='compra' THEN p_compra_id ELSE NULL END,
    COALESCE(p_variante_origen, '{}'::jsonb), p_variante_destino,
    p_motivo, p_comentario, COALESCE(p_fotos, ARRAY[]::text[]),
    'alumno', 'app',
    v_estado::cambio_estado,
    CASE WHEN v_estado = 'aprobado' THEN now() ELSE NULL END,
    v_historial
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

