
CREATE OR REPLACE FUNCTION public.request_cambio_indumentaria(
  p_producto_id uuid, p_origen_tipo text, p_compra_id uuid, p_preorder_id uuid,
  p_variante_origen jsonb, p_variante_destino jsonb, p_motivo cambio_motivo,
  p_comentario text, p_fotos text[]
)
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
BEGIN
  SELECT id INTO v_alumno_id FROM public.alumnos WHERE user_id = auth.uid() LIMIT 1;
  IF v_alumno_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

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

  -- Auto-aprobado salvo que el alumno haya pedido devolución (sin destino)
  IF p_variante_destino IS NULL THEN
    v_estado := 'devolucion_solicitada';
  ELSE
    v_estado := 'aprobado';
  END IF;

  v_historial := jsonb_build_array(
    jsonb_build_object('estado', v_estado, 'at', now(), 'by', 'alumno', 'nota', 'Auto-aprobado en la app')
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
$function$;
