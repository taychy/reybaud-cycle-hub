-- ============================================================
-- Circuito único de stock de Tienda
-- ============================================================

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS order_item_id uuid,
  ADD COLUMN IF NOT EXISTS reversa_de_movimiento_id uuid;

DO $$ BEGIN
  ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_reversa_fk
    FOREIGN KEY (reversa_de_movimiento_id) REFERENCES public.stock_movements(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.stock_movements m
   SET order_item_id = sub.oi
  FROM (
    SELECT id, (regexp_match(motivo, 'order_item:([0-9a-f-]{36})'))[1]::uuid AS oi
    FROM public.stock_movements
    WHERE order_item_id IS NULL AND motivo ~ 'order_item:[0-9a-f-]{36}'
  ) sub
 WHERE m.id = sub.id AND sub.oi IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sm_egreso_venta
  ON public.stock_movements (order_item_id)
  WHERE tipo = 'egreso' AND order_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sm_reversa
  ON public.stock_movements (reversa_de_movimiento_id)
  WHERE reversa_de_movimiento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sm_order_id ON public.stock_movements (order_id);

CREATE OR REPLACE FUNCTION public.store_order_estados_comprometidos()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['pagado','preparando','en_preparacion','en_camioneta',
               'listo_retiro','enviado','entregado']::text[];
$$;

CREATE OR REPLACE FUNCTION public.store_order_compromete_stock(p_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_status, '') = ANY (public.store_order_estados_comprometidos());
$$;

CREATE OR REPLACE FUNCTION public.adjust_store_stock(
  p_product_id uuid,
  p_key text,
  p_delta integer,
  p_motivo text,
  p_order_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_order_item_id uuid DEFAULT NULL,
  p_reversa_de uuid DEFAULT NULL,
  p_strict boolean DEFAULT false,
  p_metodo public.cambio_metodo DEFAULT NULL,
  p_cambio_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_old int; v_new int; v_stock jsonb; v_id uuid; v_motivo text := p_motivo;
BEGIN
  IF p_product_id IS NULL OR p_delta = 0 THEN RETURN NULL; END IF;

  IF p_key IS NULL THEN
    SELECT COALESCE(stock,0) INTO v_old FROM public.store_products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSE
    SELECT COALESCE(variant_stock,'{}'::jsonb) INTO v_stock
      FROM public.store_products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_old := COALESCE((v_stock->>p_key)::int, 0);
  END IF;

  v_new := v_old + p_delta;

  IF v_new < 0 THEN
    IF p_strict THEN
      RAISE EXCEPTION 'Stock insuficiente (producto %, variante %, disponible %, solicitado %)',
        p_product_id, COALESCE(p_key,'-'), v_old, abs(p_delta);
    END IF;
    v_motivo := v_motivo || format(' [FALTANTE: %s]', abs(v_new));
  END IF;

  IF p_key IS NULL THEN
    UPDATE public.store_products SET stock = v_new, updated_at = now() WHERE id = p_product_id;
  ELSE
    UPDATE public.store_products
       SET variant_stock = jsonb_set(v_stock, ARRAY[p_key], to_jsonb(v_new), true),
           updated_at = now()
     WHERE id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements(
    product_id, tipo, cantidad, stock_anterior, stock_nuevo,
    motivo, registrado_por, variante, order_id, order_item_id,
    reversa_de_movimiento_id, metodo, cambio_id
  ) VALUES (
    p_product_id,
    CASE WHEN p_delta >= 0 THEN 'ingreso' ELSE 'egreso' END,
    abs(p_delta), v_old, v_new, v_motivo, p_user_id, p_key, p_order_id, p_order_item_id,
    p_reversa_de, p_metodo, p_cambio_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._adjust_stock_by_key(
  p_product_id uuid, p_key text, p_delta integer, p_motivo text, p_order_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.adjust_store_stock(p_product_id, p_key, p_delta, p_motivo, p_order_id, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public._adjust_product_stock(
  p_product_id uuid, p_variante jsonb, p_delta integer, p_motivo text,
  p_cambio_id uuid, p_order_id uuid, p_metodo public.cambio_metodo, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.adjust_store_stock(
    p_product_id, public._build_variant_key(p_product_id, p_variante), p_delta, p_motivo,
    p_order_id, p_user_id, NULL, NULL, false, p_metodo, p_cambio_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_store_order_stock_egreso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r RECORD; v_key text;
BEGIN
  IF NOT public.store_order_compromete_stock(NEW.status) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND public.store_order_compromete_stock(OLD.status) THEN RETURN NEW; END IF;

  FOR r IN
    SELECT oi.id, oi.product_id, oi.quantity, oi.variant_selection
    FROM public.store_order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.stock_movements
       WHERE order_item_id = r.id AND tipo = 'egreso'
    );

    v_key := public.resolve_variant_key(
      r.product_id,
      CASE WHEN jsonb_typeof(r.variant_selection) = 'object'
             AND r.variant_selection <> '{}'::jsonb
        THEN (SELECT string_agg(key || ':' || value, '|' ORDER BY key)
                FROM jsonb_each_text(r.variant_selection))
        ELSE NULL END
    );

    BEGIN
      PERFORM public.adjust_store_stock(
        r.product_id, v_key, -GREATEST(COALESCE(r.quantity,1),0),
        'Venta pedido #' || NEW.order_number,
        NEW.id, auth.uid(), r.id, NULL, false
      );
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_order_stock_egreso ON public.store_orders;
CREATE TRIGGER trg_store_order_stock_egreso
AFTER INSERT OR UPDATE OF status ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_store_order_stock_egreso();

CREATE OR REPLACE FUNCTION public._cancel_store_order_core(
  p_order_id uuid, p_reason text, p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  m RECORD;
  v_rev int := 0;
BEGIN
  SELECT * INTO v_order FROM public.store_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  FOR m IN
    SELECT e.*
      FROM public.stock_movements e
     WHERE e.order_id = p_order_id
       AND e.tipo = 'egreso'
       AND NOT EXISTS (
         SELECT 1 FROM public.stock_movements rv
          WHERE rv.reversa_de_movimiento_id = e.id
       )
     ORDER BY e.created_at
  LOOP
    BEGIN
      PERFORM public.adjust_store_stock(
        m.product_id, m.variante, m.cantidad,
        'Anulación pedido #' || v_order.order_number || COALESCE(' — ' || NULLIF(p_reason,''), ''),
        p_order_id, p_user_id, m.order_item_id, m.id, false
      );
      v_rev := v_rev + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  IF v_order.status = 'cancelado' THEN
    UPDATE public.store_orders
       SET cancelled_at = COALESCE(cancelled_at, now()),
           cancel_reason = COALESCE(cancel_reason, p_reason),
           stock_restored_at = CASE WHEN v_rev > 0 THEN now() ELSE stock_restored_at END,
           updated_at = now()
     WHERE id = p_order_id;
    RETURN jsonb_build_object('ok', true, 'order_id', p_order_id,
                              'ya_cancelado', true, 'reversas', v_rev);
  END IF;

  UPDATE public.store_orders
     SET status = 'cancelado',
         cancelled_at = now(),
         cancel_reason = p_reason,
         stock_restored_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'reversas', v_rev);
END;
$$;

DROP FUNCTION IF EXISTS public.cancel_store_order(uuid);
DROP FUNCTION IF EXISTS public.cancel_store_order(uuid, text);

CREATE OR REPLACE FUNCTION public.cancel_store_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_alumno_id uuid; v_status text;
BEGIN
  SELECT id INTO v_alumno_id FROM public.alumnos WHERE user_id = auth.uid() LIMIT 1;
  IF v_alumno_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT status INTO v_status FROM public.store_orders
   WHERE id = p_order_id AND alumno_id = v_alumno_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_status <> 'cancelado'
     AND v_status NOT IN ('pendiente','pendiente_pago','pendiente_pago_efectivo','pagado','preparando') THEN
    RAISE EXCEPTION 'No se puede cancelar el pedido en estado %', v_status;
  END IF;

  RETURN public._cancel_store_order_core(p_order_id, 'Cancelado por el cliente', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_store_order(_order_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid,'admin'::app_role) OR public.has_role(v_uid,'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'El motivo de cancelación es obligatorio';
  END IF;
  RETURN public._cancel_store_order_core(_order_id, btrim(_reason), v_uid);
END;
$$;

CREATE OR REPLACE VIEW public.vw_stock_inconsistencias AS
WITH egresos AS (
  SELECT e.*, o.order_number, o.status AS order_status
    FROM public.stock_movements e
    JOIN public.store_orders o ON o.id = e.order_id
   WHERE e.tipo = 'egreso'
)
SELECT 'PEDIDO_CANCELADO_SIN_DEVOLUCION'::text AS tipo, 'alta'::text AS severidad,
       e.order_id, e.order_number, e.product_id, e.variante,
       format('Egreso de %s sin ingreso compensatorio', e.cantidad) AS detalle
  FROM egresos e
 WHERE e.order_status = 'cancelado'
   AND NOT EXISTS (SELECT 1 FROM public.stock_movements rv WHERE rv.reversa_de_movimiento_id = e.id)
UNION ALL
SELECT 'PEDIDO_CON_DOBLE_EGRESO', 'critica',
       e.order_id, min(e.order_number), e.product_id, e.variante,
       format('%s egresos para la misma línea de pedido', count(*))
  FROM egresos e
 WHERE e.order_item_id IS NOT NULL
 GROUP BY e.order_id, e.product_id, e.variante, e.order_item_id
HAVING count(*) > 1
UNION ALL
SELECT 'PEDIDO_PAGADO_SIN_EGRESO', 'alta',
       o.id, o.order_number, i.product_id, NULL,
       format('Pedido en estado %s sin movimiento de egreso para %s', o.status, i.product_name)
  FROM public.store_orders o
  JOIN public.store_order_items i ON i.order_id = o.id AND i.product_id IS NOT NULL
 WHERE public.store_order_compromete_stock(o.status)
   AND NOT EXISTS (SELECT 1 FROM public.stock_movements m
                    WHERE m.tipo='egreso' AND (m.order_item_id = i.id OR (m.order_id = o.id AND m.product_id = i.product_id)))
UNION ALL
SELECT 'STOCK_MOVIMIENTO_NO_COINCIDE', 'media',
       s.order_id, NULL, s.product_id, s.variante,
       format('Movimiento %s: stock_anterior=%s pero el movimiento previo dejó %s',
              s.id, s.stock_anterior, s.prev_nuevo)
  FROM (
    SELECT m.*, lag(m.stock_nuevo) OVER (PARTITION BY m.product_id, COALESCE(m.variante,'') ORDER BY m.created_at, m.id) prev_nuevo
      FROM public.stock_movements m
  ) s
 WHERE s.prev_nuevo IS NOT NULL AND s.prev_nuevo <> s.stock_anterior
UNION ALL
SELECT 'STOCK_VARIANTES_NO_COINCIDE', 'media',
       NULL, NULL, p.id, NULL,
       format('stock=%s vs SUM(variant_stock)=%s', p.stock, v.suma)
  FROM public.store_products p
  JOIN LATERAL (
    SELECT SUM((value)::text::numeric) suma, count(*) n FROM jsonb_each(COALESCE(p.variant_stock,'{}'::jsonb))
  ) v ON true
 WHERE v.n > 0 AND COALESCE(v.suma,0) <> p.stock
UNION ALL
SELECT 'EGRESO_MAYOR_STOCK_DISPONIBLE', 'alta',
       m.order_id, NULL, m.product_id, m.variante,
       format('Egreso de %s sobre stock %s (resultado %s)', m.cantidad, m.stock_anterior, m.stock_nuevo)
  FROM public.stock_movements m
 WHERE m.tipo = 'egreso' AND (m.stock_nuevo < 0 OR m.cantidad > m.stock_anterior);

GRANT SELECT ON public.vw_stock_inconsistencias TO authenticated;
GRANT SELECT ON public.vw_stock_inconsistencias TO service_role;

CREATE OR REPLACE FUNCTION public.run_store_stock_tests()
RETURNS TABLE(test integer, estado text, nombre text, detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  p_simple uuid; p_var uuid; p_b uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid; o7 uuid;
  v_n int; v_s int; v_l int; v_m int;
BEGIN
  BEGIN
    INSERT INTO public.store_products (name, price, stock, status)
      VALUES ('QA Simple ' || gen_random_uuid(), 1000, 12, 'active') RETURNING id INTO p_simple;
    INSERT INTO public.store_products (name, price, status, variants, variant_stock)
      VALUES ('QA Var ' || gen_random_uuid(), 1000, 'active',
              '[{"name":"Talle","options":["L","M"]}]'::jsonb,
              '{"Talle:L":3,"Talle:M":5}'::jsonb) RETURNING id INTO p_var;
    INSERT INTO public.store_products (name, price, stock, status)
      VALUES ('QA B ' || gen_random_uuid(), 500, 10, 'active') RETURNING id INTO p_b;

    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 20000, 'pendiente') RETURNING id INTO o1;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o1, p_simple, 'QA Simple', 8, 2500);
    UPDATE public.store_orders SET status = 'pagado' WHERE id = o1;
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_simple;
    v_out := v_out || jsonb_build_object('t',1,'n','stock 12, venta 8 aprobada → 4','ok', v_s = 4, 'd', format('stock=%s', v_s));

    UPDATE public.store_orders SET status = 'pagado', updated_at = now() WHERE id = o1;
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_simple;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE order_id = o1 AND tipo='egreso';
    v_out := v_out || jsonb_build_object('t',2,'n','Webhook approved repetido → un solo egreso','ok', v_s = 4 AND v_n = 1, 'd', format('stock=%s egresos=%s', v_s, v_n));

    UPDATE public.store_orders SET status='preparando' WHERE id=o1;
    UPDATE public.store_orders SET status='en_camioneta' WHERE id=o1;
    UPDATE public.store_orders SET status='entregado' WHERE id=o1;
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_simple;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE order_id = o1 AND tipo='egreso';
    v_out := v_out || jsonb_build_object('t',3,'n','pagado→preparando→en_camioneta→entregado no re-descuenta','ok', v_s = 4 AND v_n = 1, 'd', format('stock=%s egresos=%s', v_s, v_n));

    PERFORM public._cancel_store_order_core(o1, 'QA cancel', NULL);
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_simple;
    v_out := v_out || jsonb_build_object('t',4,'n','Cancelar pedido con egreso → stock vuelve a 12','ok', v_s = 12, 'd', format('stock=%s', v_s));

    PERFORM public._cancel_store_order_core(o1, 'QA cancel 2', NULL);
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_simple;
    v_out := v_out || jsonb_build_object('t',5,'n','Cancelar dos veces no devuelve dos veces','ok', v_s = 12, 'd', format('stock=%s', v_s));

    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 1000, 'pendiente') RETURNING id INTO o2;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o2, p_simple, 'QA Simple', 3, 1000);
    PERFORM public._cancel_store_order_core(o2, 'QA sin egreso', NULL);
    SELECT stock INTO v_s FROM public.store_products WHERE id = p_simple;
    v_out := v_out || jsonb_build_object('t',6,'n','Cancelar pedido sin egreso no incrementa stock','ok', v_s = 12, 'd', format('stock=%s', v_s));

    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 1000, 'pendiente') RETURNING id INTO o3;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price, variant_selection)
      VALUES (o3, p_var, 'QA Var', 1, 1000, '{"Talle":"L"}'::jsonb);
    UPDATE public.store_orders SET status='pagado' WHERE id=o3;
    SELECT (variant_stock->>'Talle:L')::int INTO v_l FROM public.store_products WHERE id = p_var;
    PERFORM public._cancel_store_order_core(o3, 'QA var', NULL);
    SELECT (variant_stock->>'Talle:L')::int, (variant_stock->>'Talle:M')::int
      INTO v_s, v_m FROM public.store_products WHERE id = p_var;
    v_out := v_out || jsonb_build_object('t',7,'n','Variante L: 3 → venta 1 → 2 → cancelación → 3','ok', v_l = 2 AND v_s = 3, 'd', format('L_venta=%s L_final=%s', v_l, v_s));
    v_out := v_out || jsonb_build_object('t',8,'n','Cancelar una variante no toca las otras','ok', v_m = 5, 'd', format('M=%s', v_m));

    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 1000, 'pendiente') RETURNING id INTO o4;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o4, p_simple, 'QA Simple', 2, 1000), (o4, p_b, 'QA B', 3, 500);
    UPDATE public.store_orders SET status='pagado' WHERE id=o4;
    SELECT stock INTO v_s FROM public.store_products WHERE id=p_simple;
    SELECT stock INTO v_n FROM public.store_products WHERE id=p_b;
    PERFORM public._cancel_store_order_core(o4, 'QA multi', NULL);
    SELECT stock INTO v_l FROM public.store_products WHERE id=p_simple;
    SELECT stock INTO v_m FROM public.store_products WHERE id=p_b;
    v_out := v_out || jsonb_build_object('t',9,'n','Pedido multi-producto: un egreso y una devolución por línea',
      'ok', v_s=10 AND v_n=7 AND v_l=12 AND v_m=10, 'd', format('venta(%s,%s) final(%s,%s)', v_s, v_n, v_l, v_m));

    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 1000, 'pendiente') RETURNING id INTO o5;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o5, p_b, 'QA B', 15, 500);
    UPDATE public.store_orders SET status='pagado' WHERE id=o5;
    SELECT stock INTO v_s FROM public.store_products WHERE id=p_b;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE order_id=o5 AND stock_nuevo < 0;
    v_out := v_out || jsonb_build_object('t',10,'n','Egreso mayor al stock no se disimula con GREATEST(...,0)',
      'ok', v_s = -5 AND v_n = 1, 'd', format('stock=%s movimientos_negativos=%s', v_s, v_n));
    PERFORM public._cancel_store_order_core(o5, 'QA neg', NULL);

    SELECT count(*) INTO v_n FROM public.stock_movements
     WHERE order_id = o4 AND tipo='egreso' AND order_item_id IS NOT NULL AND motivo IS NOT NULL;
    v_out := v_out || jsonb_build_object('t',11,'n','Cada egreso de venta es trazable (order_item_id + motivo)','ok', v_n = 2, 'd', format('egresos_trazables=%s', v_n));

    SELECT count(*) INTO v_n FROM public.stock_movements
     WHERE order_id = o4 AND tipo='ingreso' AND reversa_de_movimiento_id IS NOT NULL;
    v_out := v_out || jsonb_build_object('t',12,'n','La cancelación deja ingreso compensatorio enlazado al egreso','ok', v_n = 2, 'd', format('reversas=%s', v_n));

    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 1000, 'pendiente') RETURNING id INTO o6;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o6, p_simple, 'QA Simple', 4, 1000);
    UPDATE public.store_orders SET status='pagado' WHERE id=o6;
    PERFORM public._cancel_store_order_core(o6, 'Cancelado por el cliente', NULL);
    SELECT stock INTO v_s FROM public.store_products WHERE id=p_simple;
    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 1000, 'pendiente') RETURNING id INTO o7;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o7, p_simple, 'QA Simple', 4, 1000);
    UPDATE public.store_orders SET status='pagado' WHERE id=o7;
    PERFORM public._cancel_store_order_core(o7, 'Cancelado por admin', NULL);
    SELECT stock INTO v_n FROM public.store_products WHERE id=p_simple;
    v_out := v_out || jsonb_build_object('t',13,'n','Cancelación alumno y admin producen el mismo resultado contable','ok', v_s = 12 AND v_n = 12, 'd', format('alumno=%s admin=%s', v_s, v_n));

    INSERT INTO public.store_orders (customer_name, total, status) VALUES ('QA', 1000, 'pendiente') RETURNING id INTO o2;
    INSERT INTO public.store_order_items (order_id, product_id, product_name, quantity, unit_price)
      VALUES (o2, NULL, 'QA libre', 1, 1000), (o2, p_b, 'QA B', 1, 500);
    UPDATE public.store_orders SET status='pagado' WHERE id=o2;
    SELECT count(*) INTO v_n FROM public.stock_movements WHERE order_id=o2 AND tipo='egreso';
    v_out := v_out || jsonb_build_object('t',14,'n','Una línea sin product_id no rompe la transacción','ok', v_n = 1, 'd', format('egresos=%s', v_n));

    BEGIN
      PERFORM public._cancel_store_order_core('00000000-0000-0000-0000-000000000000'::uuid, 'QA', NULL);
      v_out := v_out || jsonb_build_object('t',15,'n','Cancelación inválida aborta la operación completa','ok', false, 'd', 'no lanzó excepción');
    EXCEPTION WHEN OTHERS THEN
      v_out := v_out || jsonb_build_object('t',15,'n','Cancelación inválida aborta la operación completa (ROLLBACK)','ok', true, 'd', SQLERRM);
    END;

    RAISE EXCEPTION 'ROLLBACK_TESTS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TESTS' THEN
      v_out := v_out || jsonb_build_object('t',0,'n','ERROR FATAL durante los tests de stock','ok', false, 'd', SQLERRM);
    END IF;
  END;

  RETURN QUERY
  SELECT (e->>'t')::int,
         CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,
         e->>'n', e->>'d'
  FROM jsonb_array_elements(v_out) e
  ORDER BY (e->>'t')::int;
END;
$$;