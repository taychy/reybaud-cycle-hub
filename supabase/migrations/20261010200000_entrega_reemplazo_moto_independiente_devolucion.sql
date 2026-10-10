-- Estados físicos independientes: el reemplazo puede llegar al alumno
-- antes de que el alumno devuelva su prenda original.
ALTER TABLE public.store_cambios
  ADD COLUMN IF NOT EXISTS reemplazo_canal_entrega text,
  ADD COLUMN IF NOT EXISTS reemplazo_despachado_at timestamptz,
  ADD COLUMN IF NOT EXISTS reemplazo_entregado_at timestamptz,
  ADD COLUMN IF NOT EXISTS reemplazo_entregado_por uuid,
  ADD COLUMN IF NOT EXISTS reemplazo_entrega_nota text;
ALTER TABLE public.store_cambios
  DROP CONSTRAINT IF EXISTS store_cambios_reemplazo_canal_chk;
ALTER TABLE public.store_cambios
  ADD CONSTRAINT store_cambios_reemplazo_canal_chk
  CHECK (reemplazo_canal_entrega IS NULL OR
         reemplazo_canal_entrega IN ('camioneta','moto','mano'));

CREATE OR REPLACE FUNCTION public.registrar_envio_moto_reemplazo(
  p_cambio_id uuid, p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.store_cambios%ROWTYPE; v_uid uuid:=auth.uid();
BEGIN
 IF v_uid IS NULL OR NOT (
    public.has_role(v_uid,'admin'::app_role)
    OR public.has_role(v_uid,'deposito'::app_role)
 ) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
 IF NOT FOUND OR c.tipo NOT IN ('cambio','sustitucion_falta_stock') THEN
   RAISE EXCEPTION 'Cambio inexistente';
 END IF;
 IF c.reemplazo_entregado_at IS NOT NULL THEN
   RAISE EXCEPTION 'El reemplazo ya fue entregado';
 END IF;
 IF c.preparado_at IS NULL OR c.stock_descontado_at IS NULL THEN
   RAISE EXCEPTION 'Primero prepará y registrá la prenda que va a enviarse';
 END IF;
 IF EXISTS(SELECT 1 FROM public.vehiculo_carga_items
     WHERE source_table='store_cambios' AND source_id=p_cambio_id
       AND estado IN ('cargado','faltante')) THEN
   RAISE EXCEPTION 'El cambio está en camioneta. Debe retirarse de esa carga antes de enviar por moto';
 END IF;
 IF c.reemplazo_canal_entrega='moto' AND c.reemplazo_despachado_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',true,'ya_enviado',true);
 END IF;
 UPDATE public.store_cambios SET
   reemplazo_canal_entrega='moto',
   reemplazo_despachado_at=now(),
   reemplazo_entrega_nota=NULLIF(trim(COALESCE(p_nota,'')),''),
   historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(
     jsonb_build_object('evento','reemplazo_enviado_moto','at',now(),
       'by',v_uid,'nota',p_nota,'devolucion_pendiente',c.recibido_en IS NULL)
   )
 WHERE id=p_cambio_id;
 RETURN jsonb_build_object('ok',true,'ya_enviado',false);
END; $$;

CREATE OR REPLACE FUNCTION public.confirmar_entrega_reemplazo(
  p_cambio_id uuid, p_canal text DEFAULT 'mano', p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.store_cambios%ROWTYPE; v_uid uuid:=auth.uid();
BEGIN
 IF v_uid IS NULL OR NOT (
   public.has_role(v_uid,'admin'::app_role)
   OR public.has_role(v_uid,'deposito'::app_role)
 ) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_canal NOT IN ('camioneta','moto','mano') THEN
   RAISE EXCEPTION 'Medio de entrega inválido'; END IF;
 SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
 IF NOT FOUND OR c.tipo NOT IN ('cambio','sustitucion_falta_stock') THEN
   RAISE EXCEPTION 'Cambio inexistente'; END IF;
 IF c.reemplazo_entregado_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',true,'ya_entregado',true,
     'devolucion_pendiente',c.tipo='cambio' AND c.recibido_en IS NULL);
 END IF;
 IF c.preparado_at IS NULL OR c.stock_descontado_at IS NULL
   OR c.reemplazo_estado NOT IN ('enviado','entregado') THEN
   RAISE EXCEPTION 'Primero prepará el reemplazo y registrá su egreso de stock';
 END IF;
 IF c.estado IN ('cancelado','rechazado') THEN
   RAISE EXCEPTION 'Cambio cancelado o rechazado'; END IF;
 IF c.reemplazo_canal_entrega='moto' AND p_canal<>'moto' THEN
   RAISE EXCEPTION 'El reemplazo está enviado por moto. Confirmá su entrega por moto';
 END IF;
 IF p_canal='moto' AND c.reemplazo_canal_entrega<>'moto' THEN
   RAISE EXCEPTION 'Primero registrá el envío por moto';
 END IF;
 IF p_canal='camioneta' AND NOT EXISTS(
     SELECT 1 FROM public.vehiculo_carga_items
      WHERE source_table='store_cambios' AND source_id=p_cambio_id
        AND estado IN ('cargado','faltante','entregado')) THEN
   RAISE EXCEPTION 'El reemplazo no se encuentra en una carga de camioneta';
 END IF;
 IF p_canal='mano' AND EXISTS(
     SELECT 1 FROM public.vehiculo_carga_items
      WHERE source_table='store_cambios' AND source_id=p_cambio_id
        AND estado IN ('cargado','faltante')) THEN
   RAISE EXCEPTION 'El reemplazo sigue en camioneta: confirmá la entrega allí';
 END IF;
 UPDATE public.store_cambios SET
    reemplazo_canal_entrega=p_canal,
    reemplazo_entregado_at=now(),
    reemplazo_entregado_por=v_uid,
    reemplazo_entrega_nota=COALESCE(NULLIF(trim(p_nota),''),reemplazo_entrega_nota),
    reemplazo_estado='entregado'::public.cambio_reemplazo_estado,
    -- "entregado" es el cambio COMPLETO. Si aún falta devolver la
    -- original, conservamos el estado abierto para seguir reclamándola.
    estado=CASE WHEN tipo='sustitucion_falta_stock' OR recibido_en IS NOT NULL
      THEN 'entregado'::public.cambio_estado ELSE estado END,
    historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(
      jsonb_build_object('evento','reemplazo_entregado','at',now(),
        'by',v_uid,'canal',p_canal,'nota',p_nota,
        'devolucion_pendiente',c.tipo='cambio' AND c.recibido_en IS NULL)
    )
 WHERE id=p_cambio_id;
 IF p_canal='camioneta' THEN
   UPDATE public.vehiculo_carga_items SET
      estado='entregado',entregado_at=COALESCE(entregado_at,now())
   WHERE source_table='store_cambios' AND source_id=p_cambio_id
     AND estado IN ('cargado','faltante');
 END IF;
 RETURN jsonb_build_object('ok',true,'ya_entregado',false,
     'devolucion_pendiente',c.tipo='cambio' AND c.recibido_en IS NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.deposito_recibir_devolucion(p_cambio_id uuid, p_metodo cambio_metodo, p_producto_id uuid, p_variante jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); c public.store_cambios%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::app_role)
                             OR public.has_role(v_uid,'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  IF c.tipo <> 'cambio' THEN RAISE EXCEPTION 'No requiere devolución física'; END IF;
  IF c.recibido_en IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ya_recibido',true); END IF;
  IF c.estado NOT IN ('aprobado','en_deposito') THEN RAISE EXCEPTION 'El cambio no está aprobado'; END IF;
  IF p_producto_id IS DISTINCT FROM c.producto_id THEN RAISE EXCEPTION 'La prenda no corresponde al cambio'; END IF;
  IF c.variante_origen IS NOT NULL AND c.variante_origen <> '{}'::jsonb AND
    public._build_variant_key(c.producto_id,COALESCE(p_variante,'{}'::jsonb))
    IS DISTINCT FROM public._build_variant_key(c.producto_id,c.variante_origen) THEN
      RAISE EXCEPTION 'Talle o color no coinciden con la devolución solicitada';
  END IF;

  UPDATE public.store_cambios SET
    recibido_en=now(), recibido_por=v_uid, metodo_recepcion=p_metodo,
    variante_origen=CASE WHEN variante_origen IS NULL OR variante_origen='{}'::jsonb
                   THEN COALESCE(p_variante,'{}'::jsonb) ELSE variante_origen END,
    estado=CASE WHEN reemplazo_entregado_at IS NOT NULL
                  THEN 'entregado'::public.cambio_estado
                -- Evitar el aviso falso "listo para retirar en sede" si ya está en camino.
                WHEN reemplazo_canal_entrega='moto' AND reemplazo_despachado_at IS NOT NULL
                  THEN 'en_deposito'::public.cambio_estado
                WHEN reemplazo_estado IN ('enviado','entregado') OR preparado_at IS NOT NULL
                  THEN 'listo_retiro'::public.cambio_estado
                ELSE 'en_deposito'::public.cambio_estado END,
    historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
       'evento','devolucion_recibida','at',now(),'by',v_uid,'metodo',p_metodo,
       'nota',CASE WHEN c.stock_devuelto_at IS NOT NULL
                 THEN 'Ingreso preexistente: recepción confirmada sin nuevo movimiento de stock'
                 WHEN c.motivo='defecto' THEN 'Prenda defectuosa: no reingresa a stock vendible'
                 ELSE 'Recepción física confirmada' END))
  WHERE id=p_cambio_id;
  RETURN jsonb_build_object('ok',true,'ya_recibido',false);
END;
$function$
;

-- La revisión de camioneta confirma sólo el reemplazo, no una devolución inexistente.
CREATE OR REPLACE FUNCTION public.resolver_item_chequeo(_item_id uuid, _accion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.vehiculo_carga_items%ROWTYPE;
  v_order uuid;
  v_order_status text;
  v_entrega_orden boolean := false;
  v_cambio public.store_cambios%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO v_item FROM public.vehiculo_carga_items WHERE id=_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ítem inexistente'; END IF;
  IF v_item.estado <> 'faltante' THEN RAISE EXCEPTION 'El ítem no está pendiente de revisión'; END IF;

  IF _accion = 'sigue_en_camioneta' THEN
    UPDATE public.vehiculo_carga_items
    SET estado='cargado',chequeado_at=now(),chequeado_by=auth.uid(),updated_at=now()
    WHERE id=_item_id;
    RETURN jsonb_build_object('estado','cargado');
  END IF;
  IF _accion <> 'entregado' THEN RAISE EXCEPTION 'Acción inválida'; END IF;

  IF v_item.source_table='store_order_items' THEN
    SELECT oi.order_id INTO v_order FROM public.store_order_items oi WHERE oi.id=v_item.source_id;
    SELECT status INTO v_order_status FROM public.store_orders WHERE id=v_order FOR UPDATE;
    IF v_order_status IN ('cancelado','reembolsado') THEN
      RAISE EXCEPTION 'La compra fue cancelada o reembolsada: no marcar entregada';
    END IF;
  ELSIF v_item.source_table='store_cambios' THEN
    SELECT * INTO v_cambio FROM public.store_cambios WHERE id=v_item.source_id FOR UPDATE;
    IF v_cambio.id IS NULL THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
    IF v_cambio.stock_descontado_at IS NULL THEN
      RAISE EXCEPTION 'No consta el reemplazo preparado; no puede marcarse entregado';
    END IF;
  END IF;

  UPDATE public.vehiculo_carga_items
  SET estado='entregado',entregado_at=COALESCE(entregado_at,now()),updated_at=now()
  WHERE id=_item_id;

  IF v_item.source_table='pedidos_externos' THEN
    UPDATE public.pedidos_externos SET estado='entregado',updated_at=now()
    WHERE id=v_item.source_id AND estado<>'entregado';
  ELSIF v_item.source_table='store_order_items' THEN
    -- Sólo se marca el pedido COMPLETO si todas sus líneas están confirmadas.
    SELECT NOT EXISTS (
      SELECT 1 FROM public.store_order_items oi
      WHERE oi.order_id=v_order
      AND NOT EXISTS (
        SELECT 1 FROM public.vehiculo_carga_items x
        WHERE x.source_table='store_order_items'
          AND x.source_id=oi.id AND x.estado='entregado'
      )
    ) INTO v_entrega_orden;
    IF v_entrega_orden AND v_order IS NOT NULL THEN
      UPDATE public.store_orders
      SET status='entregado', delivered_at=COALESCE(delivered_at,now())
      WHERE id=v_order AND status NOT IN ('entregado','cancelado','reembolsado');
    END IF;
  ELSIF v_item.source_table='delivery_list_items' THEN
    UPDATE public.delivery_list_items SET preparado=true WHERE id=v_item.source_id;
  ELSIF v_item.source_table='store_cambios' THEN
    PERFORM public.confirmar_entrega_reemplazo(
      v_item.source_id,'camioneta','Entrega confirmada en revisión de camioneta'
    );
  END IF;

  RETURN jsonb_build_object('estado','entregado','pedido_completo',v_entrega_orden);
END;
$function$
;

REVOKE ALL ON FUNCTION public.registrar_envio_moto_reemplazo(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.confirmar_entrega_reemplazo(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_moto_reemplazo(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_entrega_reemplazo(uuid,text,text) TO authenticated,service_role;
