-- Keep camioneta and store-change state in sync when a change is resolved as delivered.
CREATE OR REPLACE FUNCTION public.resolver_item_chequeo(_item_id uuid, _accion text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.vehiculo_carga_items%ROWTYPE;
  v_order uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_item FROM public.vehiculo_carga_items WHERE id = _item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Ítem inexistente'; END IF;
  IF v_item.estado <> 'faltante' THEN RAISE EXCEPTION 'El ítem no está pendiente de revisión'; END IF;

  IF _accion = 'sigue_en_camioneta' THEN
    UPDATE public.vehiculo_carga_items
    SET estado = 'cargado', chequeado_at = now(), chequeado_by = auth.uid(), updated_at = now()
    WHERE id = _item_id;
    RETURN jsonb_build_object('estado', 'cargado');
  END IF;

  IF _accion <> 'entregado' THEN RAISE EXCEPTION 'Acción inválida'; END IF;

  IF v_item.source_table = 'pedidos_externos' THEN
    UPDATE public.pedidos_externos SET estado = 'entregado', updated_at = now()
    WHERE id = v_item.source_id AND estado <> 'entregado';
  ELSIF v_item.source_table = 'store_order_items' THEN
    SELECT oi.order_id INTO v_order FROM public.store_order_items oi WHERE oi.id = v_item.source_id;
    IF v_order IS NOT NULL THEN
      UPDATE public.store_orders
      SET status = 'entregado', delivered_at = COALESCE(delivered_at, now())
      WHERE id = v_order AND status NOT IN ('entregado', 'cancelado');
    END IF;
  ELSIF v_item.source_table = 'delivery_list_items' THEN
    UPDATE public.delivery_list_items SET preparado = true WHERE id = v_item.source_id;
  ELSIF v_item.source_table = 'store_cambios' THEN
    PERFORM public.transition_cambio_estado(
      v_item.source_id,
      'entregado'::cambio_estado,
      'Entregado desde camioneta'
    );
  END IF;

  UPDATE public.vehiculo_carga_items
  SET estado = 'entregado', entregado_at = COALESCE(entregado_at, now()), updated_at = now()
  WHERE id = _item_id;

  RETURN jsonb_build_object('estado', 'entregado');
END;
$function$;
