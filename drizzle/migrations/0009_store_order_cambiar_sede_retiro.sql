-- Cambiar sede de retiro de un pedido de tienda y, si ya está en camioneta,
-- mover su mercadería a la sección activa de la nueva sede.
CREATE OR REPLACE FUNCTION public.cambiar_sede_retiro_store_order(
  _order_id uuid,
  _sede_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_carga_id uuid;
  v_movidos integer := 0;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'deposito'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_order
  FROM public.store_orders
  WHERE id = _order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido inexistente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sedes WHERE id = _sede_id AND activa = true
  ) THEN
    RAISE EXCEPTION 'La sede seleccionada no está activa';
  END IF;

  IF v_order.status IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'No se puede cambiar la sede de un pedido finalizado';
  END IF;

  UPDATE public.store_orders
  SET sede_retiro_id = _sede_id
  WHERE id = _order_id;

  IF v_order.status = 'en_camioneta' THEN
    SELECT id INTO v_carga_id
    FROM public.vehiculo_cargas
    WHERE sede_id = _sede_id
      AND estado IN ('abierta', 'en_ruta')
    ORDER BY CASE WHEN estado = 'en_ruta' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1;

    IF v_carga_id IS NULL THEN
      INSERT INTO public.vehiculo_cargas (
        sede_id,
        fecha_salida,
        estado,
        created_by,
        notas
      )
      VALUES (
        _sede_id,
        CURRENT_DATE,
        'en_ruta',
        auth.uid(),
        'Creada automáticamente al cambiar la sede de retiro de un pedido en camioneta'
      )
      RETURNING id INTO v_carga_id;
    END IF;

    UPDATE public.vehiculo_carga_items i
    SET carga_id = v_carga_id,
        updated_at = now()
    WHERE i.source_table = 'store_order_items'
      AND i.source_id IN (
        SELECT oi.id
        FROM public.store_order_items oi
        WHERE oi.order_id = _order_id
      )
      AND i.estado NOT IN ('entregado', 'retornado');

    GET DIAGNOSTICS v_movidos = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', _order_id,
    'sede_retiro_id', _sede_id,
    'carga_id', v_carga_id,
    'items_movidos', v_movidos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cambiar_sede_retiro_store_order(uuid, uuid) TO authenticated;
