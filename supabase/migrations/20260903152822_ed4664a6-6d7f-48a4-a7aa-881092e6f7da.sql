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
    SELECT a.id INTO v_alumno FROM public.alumnos a LIMIT 1;
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
    SELECT sp.stock INTO v_s FROM public.store_products sp WHERE sp.id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements sm WHERE sm.cambio_id = c1 AND sm.motivo LIKE 'prueba_out%';
    v_out := v_out || jsonb_build_object('t',1,'n','Crear prueba: 1 prueba_out y stock 10 → 9','ok', v_s = 9 AND v_n = 1,
      'd', format('stock=%s movimientos=%s', v_s, v_n));

    -- B) idempotencia: misma key no duplica registro ni movimiento
    c2 := public.crear_prenda_prueba(p_test, '{}'::jsonb, o1, v_alumno, 'QA idem', 'manual', 'qa-key-1');
    c3 := public.crear_prenda_prueba(p_test, '{}'::jsonb, o1, v_alumno, 'QA idem', 'manual', 'qa-key-1');
    SELECT sp.stock INTO v_s FROM public.store_products sp WHERE sp.id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements sm WHERE sm.cambio_id = c2 AND sm.motivo LIKE 'prueba_out%';
    v_out := v_out || jsonb_build_object('t',2,'n','Misma idempotency key: mismo registro, sin segundo descuento','ok',
      c2 = c3 AND v_s = 8 AND v_n = 1, 'd', format('mismo_id=%s stock=%s movimientos=%s', c2 = c3, v_s, v_n));

    -- C) devolver prueba => 1 prueba_in, stock vuelve; segundo intento no agrega nada
    PERFORM public.prueba_devolver(c2, 'QA devolución');
    SELECT sp.stock INTO v_s FROM public.store_products sp WHERE sp.id = p_test;
    BEGIN
      PERFORM public.prueba_devolver(c2, 'QA devolución repetida');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    SELECT sp.stock INTO v_s2 FROM public.store_products sp WHERE sp.id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements sm WHERE sm.cambio_id = c2 AND sm.motivo LIKE 'prueba_in%';
    v_out := v_out || jsonb_build_object('t',3,'n','Devolver prueba: 1 prueba_in y el reintento no duplica','ok',
      v_s = 9 AND v_s2 = 9 AND v_n = 1, 'd', format('stock=%s stock_reintento=%s movimientos=%s', v_s, v_s2, v_n));

    -- D) convertir en venta => sin movimientos de stock nuevos
    c4 := public.crear_prenda_prueba(p_test, '{}'::jsonb, o1, v_alumno, 'QA venta', 'manual', NULL);
    SELECT sp.stock INTO v_s FROM public.store_products sp WHERE sp.id = p_test;
    PERFORM public.prueba_convertir_en_venta(c4, 1500, 'QA venta');
    SELECT sp.stock INTO v_s2 FROM public.store_products sp WHERE sp.id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements sm WHERE sm.cambio_id = c4;
    v_out := v_out || jsonb_build_object('t',4,'n','Convertir en venta: no genera nuevos movimientos de stock','ok',
      v_s = v_s2 AND v_n = 1, 'd', format('stock_antes=%s stock_despues=%s movimientos=%s', v_s, v_s2, v_n));

    -- E) usar como cambio => sin cambio_in sobre la prueba y sin nuevo cambio_out
    SELECT sp.stock INTO v_s FROM public.store_products sp WHERE sp.id = p_test;
    c_real := public.prueba_usar_como_cambio(c1, it_orig, 'QA cambio');
    SELECT sp.stock INTO v_s2 FROM public.store_products sp WHERE sp.id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements sm WHERE sm.cambio_id IN (c1, c_real) AND sm.motivo LIKE 'cambio_%';
    SELECT count(*) INTO v_m FROM public.store_cambios sc
      WHERE sc.id = c_real AND sc.tipo = 'cambio' AND sc.producto_id = p_orig AND sc.producto_reemplazo_id = p_test
        AND sc.prueba_origen_id = c1 AND sc.stock_descontado_at IS NOT NULL;
    v_out := v_out || jsonb_build_object('t',5,'n','Usar como cambio: 0 movimientos de stock y se crea el cambio real','ok',
      v_s = v_s2 AND v_n = 0 AND v_m = 1, 'd', format('stock_antes=%s stock_despues=%s movimientos=%s cambio_real=%s', v_s, v_s2, v_n, v_m));

    -- E2) la prueba queda cerrada como prueba, no como cambio
    SELECT count(*) INTO v_n FROM public.store_cambios sc
      WHERE sc.id = c1 AND sc.tipo = 'prueba' AND sc.prueba_resultado = 'convertida_en_cambio'
        AND sc.estado = 'entregado'::cambio_estado;
    v_out := v_out || jsonb_build_object('t',6,'n','La prueba se cierra como prueba (convertida_en_cambio)','ok', v_n = 1,
      'd', format('coincidencias=%s', v_n));

    -- F) Depósito recibe la prenda original => 1 cambio_in sobre el original, ningún egreso extra
    SELECT sp.stock INTO v_s FROM public.store_products sp WHERE sp.id = p_orig;
    PERFORM public.deposito_recibir_cambio(c_real, 'manual'::cambio_metodo, p_orig, '{}'::jsonb, false, NULL, NULL);
    SELECT sp.stock INTO v_s2 FROM public.store_products sp WHERE sp.id = p_orig;
    SELECT count(*) INTO v_n FROM public.stock_movements sm WHERE sm.cambio_id = c_real AND sm.motivo = 'cambio_in';
    SELECT count(*) INTO v_m FROM public.stock_movements sm WHERE sm.cambio_id = c_real AND sm.motivo = 'cambio_out';
    v_out := v_out || jsonb_build_object('t',7,'n','Depósito recibe la original: 1 cambio_in y 0 cambio_out','ok',
      v_s2 = v_s + 1 AND v_n = 1 AND v_m = 0, 'd', format('stock_antes=%s stock_despues=%s in=%s out=%s', v_s, v_s2, v_n, v_m));

    -- G) reintentos de cierre no duplican movimientos
    SELECT sp.stock INTO v_s FROM public.store_products sp WHERE sp.id = p_test;
    BEGIN
      PERFORM public.prueba_usar_como_cambio(c1, it_orig, 'QA repetido');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM public.prueba_convertir_en_venta(c1, 1000, 'QA repetido');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    SELECT sp.stock INTO v_s2 FROM public.store_products sp WHERE sp.id = p_test;
    SELECT count(*) INTO v_n FROM public.stock_movements sm WHERE sm.cambio_id = c1;
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

REVOKE ALL ON FUNCTION public.run_store_pruebas_tests() FROM public, anon, authenticated;