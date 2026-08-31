-- 1) Campos aditivos
ALTER TABLE public.store_cambios
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'cambio',
  ADD COLUMN IF NOT EXISTS prueba_resultado text,
  ADD COLUMN IF NOT EXISTS prueba_salida_at timestamptz,
  ADD COLUMN IF NOT EXISTS prueba_cierre_at timestamptz,
  ADD COLUMN IF NOT EXISTS prueba_order_item_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_cambios_tipo_chk') THEN
    ALTER TABLE public.store_cambios
      ADD CONSTRAINT store_cambios_tipo_chk CHECK (tipo IN ('cambio','devolucion','prueba'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_cambios_prueba_resultado_chk') THEN
    ALTER TABLE public.store_cambios
      ADD CONSTRAINT store_cambios_prueba_resultado_chk
      CHECK (prueba_resultado IS NULL OR prueba_resultado IN ('pendiente','devuelta','convertida_en_venta','convertida_en_cambio'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_cambios_tipo ON public.store_cambios(tipo);
CREATE INDEX IF NOT EXISTS idx_store_cambios_prueba_resultado ON public.store_cambios(prueba_resultado);
CREATE INDEX IF NOT EXISTS idx_store_cambios_order_id ON public.store_cambios(order_id);

-- 2) Crear prenda de prueba (admin o depósito)
CREATE OR REPLACE FUNCTION public.crear_prenda_prueba(
  p_producto_id uuid,
  p_variante jsonb DEFAULT '{}'::jsonb,
  p_order_id uuid DEFAULT NULL,
  p_alumno_id uuid DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_metodo cambio_metodo DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_alumno uuid := p_alumno_id;
  v_key text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'Falta el producto'; END IF;

  IF v_alumno IS NULL AND p_order_id IS NOT NULL THEN
    SELECT alumno_id INTO v_alumno FROM public.store_orders WHERE id = p_order_id;
  END IF;
  IF v_alumno IS NULL THEN RAISE EXCEPTION 'La prueba debe estar asociada a un alumno'; END IF;

  INSERT INTO public.store_cambios (
    alumno_id, producto_id, origen_tipo, order_id, variante_origen, variante_destino,
    motivo, comentario, estado, tipo, prueba_resultado, prueba_salida_at,
    iniciado_por, admin_iniciador_id, origen_solicitud, notificar_alumno
  ) VALUES (
    v_alumno, p_producto_id, 'compra', p_order_id, COALESCE(p_variante,'{}'::jsonb), NULL,
    'otro'::cambio_motivo, p_comentario, 'listo_retiro'::cambio_estado, 'prueba', 'pendiente', now(),
    'admin'::cambio_iniciador, auth.uid(), 'presencial'::cambio_origen, false
  ) RETURNING id INTO v_id;

  v_key := public._build_variant_key(p_producto_id, COALESCE(p_variante,'{}'::jsonb));

  PERFORM public.adjust_store_stock(
    p_producto_id, v_key, -1, 'prueba_out (prenda enviada a prueba)',
    p_order_id, auth.uid(), NULL, NULL, false, p_metodo, v_id
  );

  UPDATE public.store_cambios
     SET stock_descontado_at = now(),
         historial = historial || jsonb_build_array(jsonb_build_object(
           'estado','prueba_enviada','at',now(),'by',auth.uid(),'nota','Prenda enviada a prueba'))
   WHERE id = v_id;

  RETURN v_id;
END;
$function$;

-- 3) Recibir devolución de prueba
CREATE OR REPLACE FUNCTION public.prueba_devolver(p_cambio_id uuid, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v record; v_key text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v FROM public.store_cambios WHERE id = p_cambio_id FOR UPDATE;
  IF v IS NULL THEN RAISE EXCEPTION 'Registro no encontrado'; END IF;
  IF v.tipo <> 'prueba' THEN RAISE EXCEPTION 'El registro no es una prenda de prueba'; END IF;
  IF v.prueba_resultado <> 'pendiente' THEN
    RAISE EXCEPTION 'La prueba ya fue cerrada (%).', v.prueba_resultado;
  END IF;
  IF v.stock_devuelto_at IS NOT NULL THEN RAISE EXCEPTION 'El stock ya fue devuelto'; END IF;

  v_key := public._build_variant_key(v.producto_id, COALESCE(v.variante_origen,'{}'::jsonb));

  PERFORM public.adjust_store_stock(
    v.producto_id, v_key, 1, 'prueba_in (prueba devuelta sin compra)',
    v.order_id, auth.uid(), NULL, NULL, false, NULL, v.id
  );

  UPDATE public.store_cambios
     SET prueba_resultado = 'devuelta',
         estado = 'entregado'::cambio_estado,
         stock_devuelto_at = now(),
         prueba_cierre_at = now(),
         cerrado_at = COALESCE(cerrado_at, now()),
         historial = historial || jsonb_build_array(jsonb_build_object(
           'estado','prueba_devuelta','at',now(),'by',auth.uid(),'nota',COALESCE(p_nota,'Prueba devuelta, reingresa al stock')))
   WHERE id = p_cambio_id;
END;
$function$;

-- 4) Convertir prueba en venta (sin volver a descontar stock)
CREATE OR REPLACE FUNCTION public.prueba_convertir_en_venta(
  p_cambio_id uuid,
  p_precio numeric,
  p_nota text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v record; v_item uuid; v_nombre text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v FROM public.store_cambios WHERE id = p_cambio_id FOR UPDATE;
  IF v IS NULL THEN RAISE EXCEPTION 'Registro no encontrado'; END IF;
  IF v.tipo <> 'prueba' THEN RAISE EXCEPTION 'El registro no es una prenda de prueba'; END IF;
  IF v.prueba_resultado <> 'pendiente' THEN
    RAISE EXCEPTION 'La prueba ya fue cerrada (%).', v.prueba_resultado;
  END IF;
  IF v.order_id IS NULL THEN RAISE EXCEPTION 'La prueba no está vinculada a un pedido'; END IF;
  IF COALESCE(p_precio,0) <= 0 THEN RAISE EXCEPTION 'Indicá el precio de venta'; END IF;

  SELECT name INTO v_nombre FROM public.store_products WHERE id = v.producto_id;

  INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price, variant_selection)
  VALUES (v.order_id, v.producto_id, COALESCE(v_nombre,'Prenda de prueba'), 1, p_precio, COALESCE(v.variante_origen,'{}'::jsonb))
  RETURNING id INTO v_item;

  UPDATE public.store_orders
     SET total = COALESCE(total,0) + p_precio,
         updated_at = now()
   WHERE id = v.order_id;

  UPDATE public.store_cambios
     SET prueba_resultado = 'convertida_en_venta',
         prueba_order_item_id = v_item,
         estado = 'entregado'::cambio_estado,
         prueba_cierre_at = now(),
         cerrado_at = COALESCE(cerrado_at, now()),
         historial = historial || jsonb_build_array(jsonb_build_object(
           'estado','prueba_convertida_en_venta','at',now(),'by',auth.uid(),
           'nota',COALESCE(p_nota, format('Convertida en venta por %s', p_precio))))
   WHERE id = p_cambio_id;

  RETURN v_item;
END;
$function$;

-- 5) Usar la prueba como cambio real (sin tocar stock: la unidad ya está afuera)
CREATE OR REPLACE FUNCTION public.prueba_usar_como_cambio(p_cambio_id uuid, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v FROM public.store_cambios WHERE id = p_cambio_id FOR UPDATE;
  IF v IS NULL THEN RAISE EXCEPTION 'Registro no encontrado'; END IF;
  IF v.tipo <> 'prueba' THEN RAISE EXCEPTION 'El registro no es una prenda de prueba'; END IF;
  IF v.prueba_resultado <> 'pendiente' THEN
    RAISE EXCEPTION 'La prueba ya fue cerrada (%).', v.prueba_resultado;
  END IF;

  UPDATE public.store_cambios
     SET tipo = 'cambio',
         prueba_resultado = 'convertida_en_cambio',
         variante_destino = COALESCE(v.variante_origen,'{}'::jsonb),
         reemplazo_estado = 'entregado'::cambio_reemplazo_estado,
         estado = 'en_deposito'::cambio_estado,
         motivo = 'talle'::cambio_motivo,
         prueba_cierre_at = now(),
         historial = historial || jsonb_build_array(jsonb_build_object(
           'estado','prueba_usada_como_cambio','at',now(),'by',auth.uid(),
           'nota',COALESCE(p_nota,'La prueba se usa como reemplazo de un cambio real; falta recibir la prenda original')))
   WHERE id = p_cambio_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_prenda_prueba(uuid,jsonb,uuid,uuid,text,cambio_metodo) FROM public, anon;
REVOKE ALL ON FUNCTION public.prueba_devolver(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.prueba_convertir_en_venta(uuid,numeric,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.prueba_usar_como_cambio(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.crear_prenda_prueba(uuid,jsonb,uuid,uuid,text,cambio_metodo) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prueba_devolver(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prueba_convertir_en_venta(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prueba_usar_como_cambio(uuid,text) TO authenticated;