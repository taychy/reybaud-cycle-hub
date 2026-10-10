-- Para cambios aprobados con variante_destino={}, el operador elige talle/color al preparar.
-- No fuerza ingreso de la prenda original; no cambia registros ni stock por sí sola.
CREATE OR REPLACE FUNCTION public.deposito_preparar_reemplazo(
 p_cambio_id uuid, p_metodo public.cambio_metodo, p_producto_id uuid, p_variante jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.store_cambios%ROWTYPE;
        v_pid uuid; v_key text; v_available integer;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::app_role)
                             OR public.has_role(v_uid,'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  IF c.tipo NOT IN ('cambio','sustitucion_falta_stock') THEN
    RAISE EXCEPTION 'Este registro no admite reemplazo';
  END IF;
  IF c.reemplazo_estado IN ('enviado','entregado') OR c.preparado_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'ya_preparado',true);
  END IF;
  IF c.estado NOT IN ('aprobado','en_deposito') THEN RAISE EXCEPTION 'El cambio no está aprobado'; END IF;
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'Falta el producto de reemplazo'; END IF;
  v_pid := COALESCE(c.producto_reemplazo_id,c.producto_id);

  IF c.tipo = 'sustitucion_falta_stock' OR (c.variante_destino IS NOT NULL AND c.variante_destino <> '{}'::jsonb) THEN
    IF p_producto_id IS DISTINCT FROM v_pid OR
       public._build_variant_key(v_pid,COALESCE(p_variante,'{}'::jsonb))
        IS DISTINCT FROM public._build_variant_key(v_pid,COALESCE(c.variante_destino,'{}'::jsonb)) THEN
      RAISE EXCEPTION 'El producto o la variante no coinciden con el reemplazo acordado';
    END IF;
  END IF;

  IF c.stock_descontado_at IS NULL THEN
    v_key := public._build_variant_key(p_producto_id,COALESCE(p_variante,'{}'::jsonb));
    v_available := public._stock_disponible(p_producto_id,v_key);
    IF v_available < 1 THEN RAISE EXCEPTION 'No hay stock disponible de ese reemplazo'; END IF;
  END IF;

  UPDATE public.store_cambios SET
    producto_reemplazo_id=CASE WHEN tipo='sustitucion_falta_stock' THEN producto_reemplazo_id
      WHEN p_producto_id<>producto_id THEN p_producto_id ELSE NULL END,
    variante_destino=CASE WHEN tipo='sustitucion_falta_stock' THEN variante_destino
                         ELSE COALESCE(p_variante,variante_destino) END,
    preparado_at=now(), preparado_por=v_uid, metodo_preparacion=p_metodo,
    metodo_entrega_reemplazo=p_metodo,
    reemplazo_estado='enviado',
    estado=CASE WHEN tipo='sustitucion_falta_stock' OR recibido_en IS NOT NULL
       THEN 'listo_retiro'::public.cambio_estado ELSE estado END,
    historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'evento','reemplazo_preparado','at',now(),'by',v_uid,'metodo',p_metodo,
      'nota',CASE WHEN c.tipo='cambio' AND c.recibido_en IS NULL
                  THEN 'Reemplazo preparado; devolución pendiente'
                  ELSE 'Reemplazo preparado para el alumno' END))
  WHERE id=p_cambio_id;
  RETURN jsonb_build_object('ok',true,'ya_preparado',false);
END;
$$;
