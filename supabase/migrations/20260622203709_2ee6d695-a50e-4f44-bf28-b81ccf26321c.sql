-- 1) Update request_cambio_indumentaria to check real stock before auto-approving
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
  v_variant_stock jsonb;
  v_has_stock boolean := true;
  v_min_stock int;
  v_k text;
  v_v text;
  v_q int;
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
$function$;

-- 2) Allow depósito to mark entregado as well
CREATE OR REPLACE FUNCTION public.transition_cambio_estado(p_id uuid, p_nuevo_estado cambio_estado, p_nota text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cambio record;
  v_is_admin boolean;
  v_is_deposito boolean;
  v_is_owner boolean;
BEGIN
  SELECT * INTO v_cambio FROM public.store_cambios WHERE id = p_id;
  IF v_cambio IS NULL THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  v_is_deposito := public.has_role(auth.uid(), 'deposito'::app_role);
  v_is_owner := EXISTS (SELECT 1 FROM public.alumnos WHERE id = v_cambio.alumno_id AND user_id = auth.uid());

  IF v_is_owner AND NOT v_is_admin AND NOT v_is_deposito THEN
    IF p_nuevo_estado <> 'cancelado' OR v_cambio.estado <> 'solicitado' THEN
      RAISE EXCEPTION 'No autorizado';
    END IF;
  ELSIF NOT v_is_admin AND NOT v_is_deposito THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Depósito puede mover entre operativos y marcar entregado
  IF v_is_deposito AND NOT v_is_admin THEN
    IF p_nuevo_estado NOT IN ('en_deposito','listo_retiro','entregado') THEN
      RAISE EXCEPTION 'Depósito no puede cambiar a ese estado';
    END IF;
  END IF;

  UPDATE public.store_cambios
  SET estado = p_nuevo_estado,
      entregado_at = CASE WHEN p_nuevo_estado = 'entregado' AND entregado_at IS NULL THEN now() ELSE entregado_at END,
      cerrado_at = CASE WHEN p_nuevo_estado IN ('entregado','rechazado','cancelado') AND cerrado_at IS NULL THEN now() ELSE cerrado_at END,
      responsable_admin_id = CASE WHEN v_is_admin AND p_nuevo_estado IN ('aprobado','rechazado','entregado')
                                  THEN auth.uid() ELSE responsable_admin_id END,
      responsable_deposito_id = CASE WHEN v_is_deposito AND p_nuevo_estado IN ('en_deposito','listo_retiro','entregado')
                                     THEN auth.uid() ELSE responsable_deposito_id END,
      historial = historial || jsonb_build_array(jsonb_build_object(
        'estado', p_nuevo_estado, 'at', now(), 'by', auth.uid(), 'nota', p_nota
      ))
  WHERE id = p_id;
END;
$function$;