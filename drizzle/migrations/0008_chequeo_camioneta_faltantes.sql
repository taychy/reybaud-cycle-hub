-- 1) El chequeo sólo puede evaluar como faltante lo que ya existía cuando empezó la ronda.
CREATE OR REPLACE FUNCTION public.get_vehiculo_chequeo_diff(_chequeo_id uuid)
 RETURNS TABLE(item_id uuid, cliente_nombre text, producto text, variante text, cantidad numeric, source_table text, en_base boolean, escaneado boolean, informado_entregado boolean, resultado text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_carga uuid;
  v_ronda integer;
  v_prev uuid;
  v_started timestamptz;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT c.carga_id, c.ronda, c.started_at INTO v_carga, v_ronda, v_started
  FROM public.vehiculo_chequeos c WHERE c.id = _chequeo_id;
  IF v_carga IS NULL THEN RETURN; END IF;

  SELECT c.id INTO v_prev FROM public.vehiculo_chequeos c
  WHERE c.carga_id = v_carga AND c.ronda < v_ronda AND c.estado = 'cerrado'
  ORDER BY c.ronda DESC LIMIT 1;

  RETURN QUERY
  WITH base AS (
    SELECT i.id
    FROM public.vehiculo_carga_items i
    WHERE i.carga_id = v_carga
      -- Lo incorporado DESPUÉS de iniciada la ronda no es "esperado" en esa ronda.
      AND (v_started IS NULL OR i.created_at <= v_started)
      AND (
        (v_prev IS NULL AND i.estado = 'cargado')
        OR (v_prev IS NOT NULL AND EXISTS (SELECT 1 FROM public.vehiculo_chequeo_scans s WHERE s.chequeo_id = v_prev AND s.item_id = i.id))
      )
  ),
  scans AS (
    SELECT s.item_id FROM public.vehiculo_chequeo_scans s WHERE s.chequeo_id = _chequeo_id
  ),
  info AS (
    SELECT i.id,
      COALESCE(
        CASE
          WHEN i.estado = 'entregado' THEN true
          WHEN i.source_table = 'delivery_list_items' THEN (SELECT d.preparado FROM public.delivery_list_items d WHERE d.id = i.source_id)
          WHEN i.source_table = 'store_order_items' THEN (
            SELECT o.status = 'entregado' FROM public.store_order_items oi
            JOIN public.store_orders o ON o.id = oi.order_id WHERE oi.id = i.source_id
          )
          WHEN i.source_table = 'pedidos_externos' THEN (SELECT p.estado = 'entregado' FROM public.pedidos_externos p WHERE p.id = i.source_id)
          ELSE false
        END, false) AS informado
    FROM public.vehiculo_carga_items i
    WHERE i.carga_id = v_carga
  )
  SELECT
    i.id,
    i.cliente_nombre,
    i.producto,
    i.variante,
    i.cantidad,
    i.source_table,
    (b.id IS NOT NULL) AS en_base,
    (sc.item_id IS NOT NULL) AS escaneado,
    inf.informado,
    CASE
      WHEN sc.item_id IS NOT NULL AND inf.informado THEN 'entregado_pero_presente'
      WHEN sc.item_id IS NOT NULL AND b.id IS NULL THEN 'nuevo'
      WHEN sc.item_id IS NOT NULL THEN 'presente'
      WHEN b.id IS NOT NULL AND inf.informado THEN 'entregado_ok'
      WHEN b.id IS NOT NULL THEN 'faltante_sin_aviso'
      ELSE 'fuera_de_ronda'
    END AS resultado
  FROM public.vehiculo_carga_items i
  LEFT JOIN base b ON b.id = i.id
  LEFT JOIN scans sc ON sc.item_id = i.id
  LEFT JOIN info inf ON inf.id = i.id
  WHERE i.carga_id = v_carga
  ORDER BY i.cliente_nombre, i.producto;
END;
$function$;

-- 2) Pedido externo entregado -> su mercadería de camioneta queda entregada.
CREATE OR REPLACE FUNCTION public.sync_pedido_externo_entregado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.estado = 'entregado' AND COALESCE(OLD.estado, '') <> 'entregado' THEN
    UPDATE public.vehiculo_carga_items i
    SET estado = 'entregado',
        entregado_at = COALESCE(i.entregado_at, now()),
        updated_at = now()
    WHERE i.source_table = 'pedidos_externos'
      AND i.source_id = NEW.id
      AND i.estado IN ('cargado', 'faltante');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pedido_externo_entregado ON public.pedidos_externos;
CREATE TRIGGER trg_sync_pedido_externo_entregado
AFTER UPDATE OF estado ON public.pedidos_externos
FOR EACH ROW EXECUTE FUNCTION public.sync_pedido_externo_entregado();

-- 3) Resolver un ítem no encontrado en el control, desde la pantalla de Camioneta.
CREATE OR REPLACE FUNCTION public.resolver_item_chequeo(_item_id uuid, _accion text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Marcar la fuente como entregada con el flujo existente de cada origen.
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
  END IF;

  UPDATE public.vehiculo_carga_items
  SET estado = 'entregado', entregado_at = COALESCE(entregado_at, now()), updated_at = now()
  WHERE id = _item_id;

  RETURN jsonb_build_object('estado', 'entregado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_item_chequeo(uuid, text) TO authenticated;