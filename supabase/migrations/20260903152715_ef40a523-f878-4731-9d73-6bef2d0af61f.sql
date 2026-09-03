-- 1) Campos aditivos: idempotencia de alta y trazabilidad prueba -> cambio real
ALTER TABLE public.store_cambios
  ADD COLUMN IF NOT EXISTS prueba_idempotency_key text,
  ADD COLUMN IF NOT EXISTS prueba_origen_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_cambios_prueba_origen_fk') THEN
    ALTER TABLE public.store_cambios
      ADD CONSTRAINT store_cambios_prueba_origen_fk
      FOREIGN KEY (prueba_origen_id) REFERENCES public.store_cambios(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_cambios_prueba_idem
  ON public.store_cambios(prueba_idempotency_key)
  WHERE prueba_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_cambios_prueba_origen ON public.store_cambios(prueba_origen_id);

-- 2) crear_prenda_prueba con idempotencia opcional
DROP FUNCTION IF EXISTS public.crear_prenda_prueba(uuid,jsonb,uuid,uuid,text,cambio_metodo);

CREATE OR REPLACE FUNCTION public.crear_prenda_prueba(
  p_producto_id uuid,
  p_variante jsonb DEFAULT '{}'::jsonb,
  p_order_id uuid DEFAULT NULL,
  p_alumno_id uuid DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_metodo cambio_metodo DEFAULT 'manual',
  p_idempotency_key text DEFAULT NULL
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

  -- Reintento con la misma clave: devolvemos el registro original sin tocar stock.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.store_cambios WHERE prueba_idempotency_key = p_idempotency_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  IF v_alumno IS NULL AND p_order_id IS NOT NULL THEN
    SELECT alumno_id INTO v_alumno FROM public.store_orders WHERE id = p_order_id;
  END IF;
  IF v_alumno IS NULL THEN RAISE EXCEPTION 'La prueba debe estar asociada a un alumno'; END IF;

  BEGIN
    INSERT INTO public.store_cambios (
      alumno_id, producto_id, origen_tipo, order_id, variante_origen, variante_destino,
      motivo, comentario, estado, tipo, prueba_resultado, prueba_salida_at,
      iniciado_por, admin_iniciador_id, origen_solicitud, notificar_alumno, prueba_idempotency_key
    ) VALUES (
      v_alumno, p_producto_id, 'compra', p_order_id, COALESCE(p_variante,'{}'::jsonb), NULL,
      'otro'::cambio_motivo, p_comentario, 'listo_retiro'::cambio_estado, 'prueba', 'pendiente', now(),
      'admin'::cambio_iniciador, auth.uid(), 'presencial'::cambio_origen, false, p_idempotency_key
    ) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.store_cambios WHERE prueba_idempotency_key = p_idempotency_key;
    IF v_id IS NULL THEN RAISE; END IF;
    RETURN v_id;
  END;

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

-- 3) prueba_usar_como_cambio: la prueba se cierra y se crea un CAMBIO REAL separado.
--    La prenda de prueba NO vuelve al stock y no genera un segundo egreso.
DROP FUNCTION IF EXISTS public.prueba_usar_como_cambio(uuid,text);

CREATE OR REPLACE FUNCTION public.prueba_usar_como_cambio(
  p_cambio_id uuid,
  p_order_item_id uuid,
  p_nota text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v record; v_item record; v_order record; v_new uuid;
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
  IF p_order_item_id IS NULL THEN RAISE EXCEPTION 'Elegí qué prenda del pedido devuelve el alumno'; END IF;

  SELECT * INTO v_item FROM public.store_order_items WHERE id = p_order_item_id;
  IF v_item IS NULL THEN RAISE EXCEPTION 'Ítem del pedido no encontrado'; END IF;
  IF v_item.order_id IS DISTINCT FROM v.order_id THEN
    RAISE EXCEPTION 'El ítem elegido no pertenece al pedido de la prueba';
  END IF;
  IF v_item.product_id IS NULL THEN
    RAISE EXCEPTION 'El ítem elegido no tiene producto asociado';
  END IF;
  IF v_item.id = v.prueba_order_item_id THEN
    RAISE EXCEPTION 'El ítem elegido es la propia prueba';
  END IF;

  SELECT * INTO v_order FROM public.store_orders WHERE id = v.order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_order.alumno_id IS DISTINCT FROM v.alumno_id THEN
    RAISE EXCEPTION 'El pedido no corresponde al alumno de la prueba';
  END IF;

  -- Cambio real: entra la prenda comprada, sale (ya salió) la prenda de prueba.
  INSERT INTO public.store_cambios (
    alumno_id, producto_id, variante_origen,
    producto_reemplazo_id, variante_destino,
    origen_tipo, order_id, motivo, comentario,
    estado, tipo, reemplazo_estado, stock_descontado_at,
    prueba_origen_id, iniciado_por, admin_iniciador_id, origen_solicitud, notificar_alumno,
    historial
  ) VALUES (
    v.alumno_id, v_item.product_id, COALESCE(v_item.variant_selection,'{}'::jsonb),
    v.producto_id, COALESCE(v.variante_origen,'{}'::jsonb),
    'compra', v.order_id, 'talle'::cambio_motivo, p_nota,
    'aprobado'::cambio_estado, 'cambio', 'entregado'::cambio_reemplazo_estado, now(),
    v.id, 'admin'::cambio_iniciador, auth.uid(), 'presencial'::cambio_origen, false,
    jsonb_build_array(jsonb_build_object(
      'estado','cambio_desde_prueba','at',now(),'by',auth.uid(),
      'nota','El reemplazo ya está entregado (era la prenda de prueba). Falta recibir la prenda original.'))
  ) RETURNING id INTO v_new;

  -- La prueba se cierra como prueba (nunca pasa por en_deposito: no debe reingresar stock).
  UPDATE public.store_cambios
     SET prueba_resultado = 'convertida_en_cambio',
         estado = 'entregado'::cambio_estado,
         prueba_cierre_at = now(),
         cerrado_at = COALESCE(cerrado_at, now()),
         historial = historial || jsonb_build_array(jsonb_build_object(
           'estado','prueba_usada_como_cambio','at',now(),'by',auth.uid(),
           'cambio_id', v_new,
           'nota',COALESCE(p_nota,'La prueba se usa como reemplazo de un cambio real')))
   WHERE id = p_cambio_id;

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_prenda_prueba(uuid,jsonb,uuid,uuid,text,cambio_metodo,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.prueba_usar_como_cambio(uuid,uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.crear_prenda_prueba(uuid,jsonb,uuid,uuid,text,cambio_metodo,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prueba_usar_como_cambio(uuid,uuid,text) TO authenticated;

-- 4) Tests de regresión de stock de prendas de prueba (crean y revierten todo)
CREATE OR REPLACE FUNCTION public.run_store_pruebas_tests()
RETURNS TABLE(test int, estado text, nombre text, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_admin uuid; v_alumno uuid;
  p_test uuid; p_orig uuid;
  o1 uuid; it_orig uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c_real uuid;
  v_n int; v_m int; v_s int; v_s2 int;
BEGIN
  BEGIN
    SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin'::app_role LIMIT 1;
    SELECT id INTO v_alumno FROM public.alumnos LIMIT 1;
    IF v_admin IS NULL OR v_alumno IS NULL THEN
      RAISE EXCEPTION 'No hay admin o alumno para correr los tests';
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    INSERT INTO public.store_products (name, price, stock, status)
      VALUES ('QA Prueba ' || gen_random_uuid(), 1000, 10, 'active') RETURNING id INTO p_test;
    INSERT INTO public.store_products (name, price, stock, status)
      VALUES ('QA Original ' || gen_random_uuid(), 1000, 10, 'active') RETURNING id INTO p_orig;

    INSERT INTO public.store_orders (customer_name, total, status, alumno_id)
      VALUES ('QA Pruebas', 1000, 'pendiente', v_alumno) RETURNING id INTO o1;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o1, p_orig, 'QA Original', 1, 1000) RETURNING id INTO it_orig;

    -- A) crear prueba => exactamente 1 prueba_out y stock -1
    c1 := public.crear_prenda_prueba(p_test, '{}'::jsonb, o1, v_alumno, 'QA', 'manual', NULL);
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE cambio_id = c1 AND motivo LIKE 'prueba_out%';
    v_out := v_out || jsonb_build_object('t',1,'n','Crear prueba: 1 prueba_out y stock 10 → 9','ok', v_s = 9 AND v_n = 1,
      'd', format('stock=%s movimientos=%s', v_s, v_n));

    -- B) idempotencia: misma key no duplica registro ni movimiento
    c2 := public.crear_prenda_prueba(p_test, '{}'::jsonb, o1, v_alumno, 'QA idem', 'manual', 'qa-key-1');
    c3 := public.crear_prenda_prueba(p_test, '{}'::jsonb, o1, v_alumno, 'QA idem', 'manual', 'qa-key-1');
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE cambio_id = c2 AND motivo LIKE 'prueba_out%';
    v_out := v_out || jsonb_build_object('t',2,'n','Misma idempotency key: mismo registro, sin segundo descuento','ok',
      c2 = c3 AND v_s = 8 AND v_n = 1, 'd', format('mismo_id=%s stock=%s movimientos=%s', c2 = c3, v_s, v_n));

    -- C) devolver prueba => 1 prueba_in, stock vuelve; segundo intento no agrega nada
    PERFORM public.prueba_devolver(c2, 'QA devolución');
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_test;
    BEGIN
      PERFORM public.prueba_devolver(c2, 'QA devolución repetida');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    SELECT stock INTO v_s2 FROM public.store_products WHERE id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE cambio_id = c2 AND motivo LIKE 'prueba_in%';
    v_out := v_out || jsonb_build_object('t',3,'n','Devolver prueba: 1 prueba_in y el reintento no duplica','ok',
      v_s = 9 AND v_s2 = 9 AND v_n = 1, 'd', format('stock=%s stock_reintento=%s movimientos=%s', v_s, v_s2, v_n));

    -- D) convertir en venta => sin movimientos de stock nuevos
    c4 := public.crear_prenda_prueba(p_test, '{}'::jsonb, o1, v_alumno, 'QA venta', 'manual', NULL);
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_test;
    PERFORM public.prueba_convertir_en_venta(c4, 1500, 'QA venta');
    SELECT stock INTO v_s2 FROM public.store_products WHERE id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE cambio_id = c4;
    v_out := v_out || jsonb_build_object('t',4,'n','Convertir en venta: no genera nuevos movimientos de stock','ok',
      v_s = v_s2 AND v_n = 1, 'd', format('stock_antes=%s stock_despues=%s movimientos=%s', v_s, v_s2, v_n));

    -- E) usar como cambio => sin cambio_in sobre la prueba y sin nuevo cambio_out
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_test;
    c_real := public.prueba_usar_como_cambio(c1, it_orig, 'QA cambio');
    SELECT stock INTO v_s2 FROM public.store_products WHERE id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE cambio_id IN (c1, c_real) AND motivo LIKE 'cambio_%';
    SELECT count(*) INTO v_m FROM public.store_cambios
      WHERE id = c_real AND tipo = 'cambio' AND producto_id = p_orig AND producto_reemplazo_id = p_test
        AND prueba_origen_id = c1 AND stock_descontado_at IS NOT NULL;
    v_out := v_out || jsonb_build_object('t',5,'n','Usar como cambio: 0 movimientos de stock y se crea el cambio real','ok',
      v_s = v_s2 AND v_n = 0 AND v_m = 1, 'd', format('stock_antes=%s stock_despues=%s movimientos=%s cambio_real=%s', v_s, v_s2, v_n, v_m));

    -- E2) la prueba queda cerrada como prueba, no como cambio
    SELECT count(*) INTO v_n FROM public.store_cambios
      WHERE id = c1 AND tipo = 'prueba' AND prueba_resultado = 'convertida_en_cambio' AND estado = 'entregado';
    v_out := v_out || jsonb_build_object('t',6,'n','La prueba se cierra como prueba (convertida_en_cambio)','ok', v_n = 1,
      'd', format('coincidencias=%s', v_n));

    -- F) Depósito recibe la prenda original => 1 cambio_in sobre el original, ningún egreso extra
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_orig;
    PERFORM public.deposito_recibir_cambio(c_real, 'manual'::cambio_metodo, p_orig, '{}'::jsonb, false, NULL, NULL);
    SELECT stock INTO v_s2 FROM public.store_products WHERE id = p_orig;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE cambio_id = c_real AND motivo = 'cambio_in';
    SELECT count(*) INTO v_m FROM public.stock_movements WHERE cambio_id = c_real AND motivo = 'cambio_out';
    v_out := v_out || jsonb_build_object('t',7,'n','Depósito recibe la original: 1 cambio_in y 0 cambio_out','ok',
      v_s2 = v_s + 1 AND v_n = 1 AND v_m = 0, 'd', format('stock_antes=%s stock_despues=%s in=%s out=%s', v_s, v_s2, v_n, v_m));

    -- G) reintentos de cierre no duplican movimientos
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_test;
    BEGIN
      PERFORM public.prueba_usar_como_cambio(c1, it_orig, 'QA repetido');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM public.prueba_convertir_en_venta(c1, 1000, 'QA repetido');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    SELECT stock INTO v_s2 FROM public.store_products WHERE id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE cambio_id = c1;
    v_out := v_out || jsonb_build_object('t',8,'n','Reintentar cierres ya resueltos no mueve stock','ok',
      v_s = v_s2 AND v_n = 1, 'd', format('stock=%s movimientos_prueba=%s', v_s2, v_n));

    RAISE EXCEPTION 'ROLLBACK_TESTS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TESTS' THEN
      v_out := v_out || jsonb_build_object('t',0,'n','ERROR FATAL durante los tests de pruebas','ok', false, 'd', SQLERRM);
    END IF;
  END;

  RETURN QUERY
  SELECT (e->>'t')::int,
         CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,
         e->>'n', e->>'d'
  FROM jsonb_array_elements(v_out) e
  ORDER BY (e->>'t')::int;
END;
$function$;