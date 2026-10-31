ALTER TABLE public.store_cambios ADD COLUMN IF NOT EXISTS producto_recibido_id uuid REFERENCES public.store_products(id), ADD COLUMN IF NOT EXISTS variante_recibida jsonb;
CREATE OR REPLACE FUNCTION public.store_cambios_apply_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_pid uuid;
BEGIN
 IF NEW.tipo='cambio' AND OLD.recibido_en IS NULL AND NEW.recibido_en IS NOT NULL AND NEW.stock_devuelto_at IS NULL AND NEW.motivo<>'defecto' THEN
  PERFORM public._adjust_product_stock(COALESCE(NEW.producto_recibido_id,NEW.producto_id),COALESCE(NEW.variante_recibida,NEW.variante_origen),1,'cambio_in',NEW.id,NEW.order_id,COALESCE(NEW.metodo_recepcion,'manual'),NEW.recibido_por);
  NEW.stock_devuelto_at:=now();
 END IF;
 IF NEW.stock_descontado_at IS NULL AND NEW.reemplazo_estado IN ('enviado','entregado') AND OLD.reemplazo_estado IS DISTINCT FROM NEW.reemplazo_estado AND NEW.variante_destino IS NOT NULL THEN
  v_pid:=COALESCE(NEW.producto_reemplazo_id,NEW.producto_id);
  PERFORM public._adjust_product_stock(v_pid,NEW.variante_destino,-1,'cambio_out',NEW.id,NEW.order_id,COALESCE(NEW.metodo_preparacion,NEW.metodo_entrega_reemplazo,'manual'),COALESCE(NEW.preparado_por,NEW.recibido_por));
  NEW.stock_descontado_at:=now();
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.deposito_confirmar_devolucion(p_cambio_id uuid,p_metodo public.cambio_metodo,p_producto_id uuid,p_variante jsonb,p_confirmacion_fisica boolean,p_motivo_discrepancia text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE c public.store_cambios%ROWTYPE; v_uid uuid:=auth.uid(); v_diff boolean; v_specs jsonb; v_spec jsonb; v_result jsonb;
BEGIN
 IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::public.app_role) OR public.has_role(v_uid,'deposito'::public.app_role)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
 IF c.tipo<>'cambio' THEN RAISE EXCEPTION 'No requiere devolución física'; END IF;
 IF c.recibido_en IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ya_recibido',true); END IF;
 IF p_confirmacion_fisica IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirmá la recepción física'; END IF;
 IF p_producto_id IS NULL OR p_metodo IS NULL OR jsonb_typeof(p_variante) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Falta identificar la prenda devuelta'; END IF;
 SELECT variants INTO v_specs FROM public.store_products WHERE id=p_producto_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
 IF jsonb_typeof(v_specs)='array' THEN
  FOR v_spec IN SELECT value FROM jsonb_array_elements(v_specs) LOOP
   IF jsonb_typeof(v_spec->'options')='array' AND jsonb_array_length(v_spec->'options')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_spec->'options') o WHERE o=p_variante->>(v_spec->>'name')) THEN RAISE EXCEPTION 'Completá las variantes válidas de la prenda recibida'; END IF;
  END LOOP;
 END IF;
 v_diff:=p_producto_id IS DISTINCT FROM c.producto_id OR (COALESCE(c.variante_origen,'{}'::jsonb)<>'{}'::jsonb AND public._build_variant_key(c.producto_id,p_variante) IS DISTINCT FROM public._build_variant_key(c.producto_id,c.variante_origen));
 IF v_diff AND c.stock_devuelto_at IS NOT NULL THEN RAISE EXCEPTION 'Ingreso de stock preexistente: conciliar discrepancia antes de recibir'; END IF;
 IF v_diff AND length(trim(COALESCE(p_motivo_discrepancia,'')))<3 THEN RAISE EXCEPTION 'Indicá el motivo de la discrepancia física'; END IF;
 UPDATE public.store_cambios SET producto_recibido_id=p_producto_id,variante_recibida=p_variante,
 historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('evento','identificacion_devolucion','at',now(),'by',v_uid,'producto_original_id',c.producto_id,'variante_original',c.variante_origen,'producto_recibido_id',p_producto_id,'variante_recibida',p_variante,'cantidad',1,'order_id',COALESCE(c.order_id,c.compra_id),'order_item_id',c.order_item_id,'preorder_id',c.preorder_id,'discrepancia',v_diff,'motivo',p_motivo_discrepancia,'stock_preexistente',c.stock_devuelto_at IS NOT NULL)) WHERE id=c.id;
 v_result:=public.deposito_recibir_devolucion(c.id,p_metodo,c.producto_id,COALESCE(c.variante_origen,'{}'::jsonb));
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.deposito_confirmar_devolucion(uuid,public.cambio_metodo,uuid,jsonb,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.deposito_confirmar_devolucion(uuid,public.cambio_metodo,uuid,jsonb,boolean,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.deposito_confirmar_devolucion(uuid,public.cambio_metodo,uuid,jsonb,boolean,text) IS 'Confirma una unidad física con identidad recibida auditada sin sobrescribir original/reemplazo. Bloquea discrepancias con ingresos históricos; serializa reintentos.';