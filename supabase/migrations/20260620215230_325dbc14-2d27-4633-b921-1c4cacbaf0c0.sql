
-- =========================================================================
-- 1. Enums nuevos
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE public.cambio_origen AS ENUM ('app','presencial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cambio_metodo AS ENUM ('qr','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cambio_reemplazo_estado AS ENUM ('sin_definir','pendiente_envio','enviado','entregado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- 2. store_cambios — columnas nuevas
-- =========================================================================
ALTER TABLE public.store_cambios
  ADD COLUMN IF NOT EXISTS origen_solicitud public.cambio_origen NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS recibido_por uuid,
  ADD COLUMN IF NOT EXISTS recibido_en timestamptz,
  ADD COLUMN IF NOT EXISTS metodo_recepcion public.cambio_metodo,
  ADD COLUMN IF NOT EXISTS metodo_entrega_reemplazo public.cambio_metodo,
  ADD COLUMN IF NOT EXISTS reemplazo_estado public.cambio_reemplazo_estado NOT NULL DEFAULT 'sin_definir',
  ADD COLUMN IF NOT EXISTS producto_reemplazo_id uuid REFERENCES public.store_products(id),
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.store_orders(id),
  ADD COLUMN IF NOT EXISTS stock_devuelto_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_descontado_at timestamptz;

-- =========================================================================
-- 3. stock_movements — columnas para trazabilidad de cambios
-- =========================================================================
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS metodo public.cambio_metodo,
  ADD COLUMN IF NOT EXISTS cambio_id uuid REFERENCES public.store_cambios(id),
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.store_orders(id);

-- =========================================================================
-- 4. Helper: construir variant_key a partir de jsonb {Name: Value}
--    respetando el orden de product.variants.
-- =========================================================================
CREATE OR REPLACE FUNCTION public._build_variant_key(p_product_id uuid, p_variante jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variants jsonb;
  v_spec jsonb;
  v_name text;
  v_val text;
  v_parts text[] := ARRAY[]::text[];
BEGIN
  IF p_variante IS NULL OR p_variante = '{}'::jsonb THEN
    RETURN NULL;
  END IF;
  SELECT variants INTO v_variants FROM public.store_products WHERE id = p_product_id;
  IF v_variants IS NULL OR jsonb_array_length(v_variants) = 0 THEN
    -- Fallback: ordenar alfabéticamente por key
    SELECT array_agg(k || ':' || (p_variante->>k) ORDER BY k)
      INTO v_parts
      FROM jsonb_object_keys(p_variante) k;
    RETURN array_to_string(v_parts, '|');
  END IF;
  FOR v_spec IN SELECT jsonb_array_elements(v_variants) LOOP
    v_name := v_spec->>'name';
    v_val := p_variante->>v_name;
    IF v_val IS NULL THEN CONTINUE; END IF;
    v_parts := v_parts || (v_name || ':' || v_val);
  END LOOP;
  IF array_length(v_parts, 1) IS NULL THEN RETURN NULL; END IF;
  RETURN array_to_string(v_parts, '|');
END;
$$;

-- =========================================================================
-- 5. Helper: incrementar/decrementar stock (con variante o sin)
-- =========================================================================
CREATE OR REPLACE FUNCTION public._adjust_product_stock(
  p_product_id uuid,
  p_variante jsonb,
  p_delta int,
  p_motivo text,
  p_cambio_id uuid,
  p_order_id uuid,
  p_metodo public.cambio_metodo,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_old int;
  v_new int;
  v_variant_stock jsonb;
BEGIN
  v_key := public._build_variant_key(p_product_id, p_variante);
  IF v_key IS NULL THEN
    -- Producto sin variantes: usar columna stock
    SELECT COALESCE(stock,0) INTO v_old FROM public.store_products WHERE id = p_product_id;
    v_new := GREATEST(v_old + p_delta, 0);
    UPDATE public.store_products SET stock = v_new WHERE id = p_product_id;
  ELSE
    SELECT COALESCE(variant_stock,'{}'::jsonb) INTO v_variant_stock
      FROM public.store_products WHERE id = p_product_id;
    v_old := COALESCE((v_variant_stock->>v_key)::int, 0);
    v_new := GREATEST(v_old + p_delta, 0);
    v_variant_stock := jsonb_set(v_variant_stock, ARRAY[v_key], to_jsonb(v_new), true);
    UPDATE public.store_products SET variant_stock = v_variant_stock WHERE id = p_product_id;
  END IF;

  INSERT INTO public.stock_movements(
    product_id, tipo, cantidad, stock_anterior, stock_nuevo,
    motivo, registrado_por, variante, metodo, cambio_id, order_id
  ) VALUES (
    p_product_id,
    CASE WHEN p_delta >= 0 THEN 'ingreso' ELSE 'egreso' END,
    abs(p_delta), v_old, v_new,
    p_motivo, p_user_id, v_key, p_metodo, p_cambio_id, p_order_id
  );
END;
$$;

-- =========================================================================
-- 6. Trigger: movimientos automáticos de stock en cambios
-- =========================================================================
CREATE OR REPLACE FUNCTION public.store_cambios_apply_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reemplazo_pid uuid;
BEGIN
  -- Ingreso de stock al pasar a en_deposito (excepto defecto)
  IF NEW.estado = 'en_deposito'
     AND (OLD.estado IS DISTINCT FROM 'en_deposito')
     AND NEW.stock_devuelto_at IS NULL
     AND NEW.motivo <> 'defecto' THEN
    PERFORM public._adjust_product_stock(
      NEW.producto_id, NEW.variante_origen, 1,
      'cambio_in', NEW.id, NEW.order_id,
      COALESCE(NEW.metodo_recepcion, 'manual'), NEW.recibido_por
    );
    NEW.stock_devuelto_at := now();
  END IF;

  -- Egreso de stock al confirmar reemplazo (listo_retiro o reemplazo_estado=enviado)
  IF NEW.stock_descontado_at IS NULL
     AND NEW.reemplazo_estado IN ('enviado','entregado')
     AND (OLD.reemplazo_estado IS DISTINCT FROM NEW.reemplazo_estado)
     AND NEW.variante_destino IS NOT NULL THEN
    v_reemplazo_pid := COALESCE(NEW.producto_reemplazo_id, NEW.producto_id);
    PERFORM public._adjust_product_stock(
      v_reemplazo_pid, NEW.variante_destino, -1,
      'cambio_out', NEW.id, NEW.order_id,
      COALESCE(NEW.metodo_entrega_reemplazo, 'manual'), NEW.recibido_por
    );
    NEW.stock_descontado_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_cambios_apply_stock ON public.store_cambios;
CREATE TRIGGER trg_store_cambios_apply_stock
  BEFORE UPDATE ON public.store_cambios
  FOR EACH ROW EXECUTE FUNCTION public.store_cambios_apply_stock();

-- =========================================================================
-- 7. Endurecer request_cambio_indumentaria: validar estado de la orden
-- =========================================================================
CREATE OR REPLACE FUNCTION public.request_cambio_indumentaria(
  p_producto_id uuid, p_origen_tipo text, p_compra_id uuid, p_preorder_id uuid,
  p_variante_origen jsonb, p_variante_destino jsonb,
  p_motivo cambio_motivo, p_comentario text, p_fotos text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_alumno_id uuid;
  v_producto record;
  v_id uuid;
  v_existing int;
  v_order_status text;
BEGIN
  SELECT id INTO v_alumno_id FROM public.alumnos WHERE user_id = auth.uid() LIMIT 1;
  IF v_alumno_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_producto FROM public.store_products WHERE id = p_producto_id;
  IF v_producto IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF v_producto.no_admite_cambio THEN RAISE EXCEPTION 'Este producto no admite cambios'; END IF;

  -- Validar estado de la orden (solo origen=compra)
  IF p_origen_tipo = 'compra' AND p_compra_id IS NOT NULL THEN
    SELECT status INTO v_order_status FROM public.store_orders
      WHERE id = p_compra_id AND alumno_id = v_alumno_id;
    IF v_order_status IS NULL THEN
      RAISE EXCEPTION 'Pedido no encontrado';
    END IF;
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

  INSERT INTO public.store_cambios (
    alumno_id, producto_id, origen_tipo, compra_id, preorder_id, order_id,
    variante_origen, variante_destino, motivo, comentario, fotos,
    iniciado_por, origen_solicitud
  ) VALUES (
    v_alumno_id, p_producto_id, p_origen_tipo, p_compra_id, p_preorder_id,
    CASE WHEN p_origen_tipo='compra' THEN p_compra_id ELSE NULL END,
    COALESCE(p_variante_origen, '{}'::jsonb), p_variante_destino,
    p_motivo, p_comentario, COALESCE(p_fotos, ARRAY[]::text[]),
    'alumno', 'app'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- =========================================================================
-- 8. RPC: cancelar pedido (alumno) — hasta estado 'preparando' inclusive
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cancel_store_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id uuid;
  v_status text;
BEGIN
  SELECT id INTO v_alumno_id FROM public.alumnos WHERE user_id = auth.uid() LIMIT 1;
  IF v_alumno_id IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT status INTO v_status FROM public.store_orders
    WHERE id = p_order_id AND alumno_id = v_alumno_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_status NOT IN ('pagado','pendiente_pago','pendiente_pago_efectivo','preparando') THEN
    RAISE EXCEPTION 'No se puede cancelar el pedido en estado %', v_status;
  END IF;

  UPDATE public.store_orders SET status = 'cancelado', updated_at = now()
    WHERE id = p_order_id;
END;
$$;

-- =========================================================================
-- 9. RPC: Ruta A — recibir cambio aprobado (desde la app) con QR/manual
-- =========================================================================
CREATE OR REPLACE FUNCTION public.deposito_recibir_cambio(
  p_cambio_id uuid,
  p_metodo public.cambio_metodo,
  p_qr_devuelto_pid uuid,
  p_qr_devuelto_variante jsonb,
  p_entregar_reemplazo boolean,
  p_qr_recibido_pid uuid,
  p_qr_recibido_variante jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cambio record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO v_cambio FROM public.store_cambios WHERE id = p_cambio_id FOR UPDATE;
  IF v_cambio IS NULL THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  IF v_cambio.estado NOT IN ('aprobado','solicitado') THEN
    RAISE EXCEPTION 'El cambio no está en estado recepcionable (estado=%)', v_cambio.estado;
  END IF;

  -- Validación leve: producto debe coincidir (no bloquea si variante difiere)
  IF p_qr_devuelto_pid IS DISTINCT FROM v_cambio.producto_id THEN
    RAISE EXCEPTION 'El QR escaneado no corresponde al producto del cambio';
  END IF;

  -- Pasar a en_deposito (el trigger devuelve stock)
  UPDATE public.store_cambios SET
    estado = 'en_deposito',
    recibido_por = v_user,
    recibido_en = now(),
    metodo_recepcion = p_metodo,
    variante_origen = COALESCE(p_qr_devuelto_variante, variante_origen)
  WHERE id = p_cambio_id;

  IF p_entregar_reemplazo THEN
    IF p_qr_recibido_pid IS NULL THEN
      RAISE EXCEPTION 'Falta producto de reemplazo';
    END IF;
    UPDATE public.store_cambios SET
      estado = 'listo_retiro',
      reemplazo_estado = 'enviado',
      metodo_entrega_reemplazo = p_metodo,
      producto_reemplazo_id = CASE WHEN p_qr_recibido_pid <> producto_id THEN p_qr_recibido_pid ELSE NULL END,
      variante_destino = COALESCE(p_qr_recibido_variante, variante_destino)
    WHERE id = p_cambio_id;
  END IF;
END;
$$;

-- =========================================================================
-- 10. RPC: Ruta B — registrar cambio presencial (sin reclamo previo)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.deposito_registrar_cambio_presencial(
  p_order_id uuid,
  p_alumno_id uuid,
  p_metodo public.cambio_metodo,
  p_qr_devuelto_pid uuid,
  p_qr_devuelto_variante jsonb,
  p_motivo cambio_motivo,
  p_comentario text,
  p_entregar_reemplazo boolean,
  p_qr_recibido_pid uuid,
  p_qr_recibido_variante jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_alumno uuid := p_alumno_id;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_qr_devuelto_pid IS NULL THEN RAISE EXCEPTION 'Falta producto recibido'; END IF;

  IF v_alumno IS NULL AND p_order_id IS NOT NULL THEN
    SELECT alumno_id INTO v_alumno FROM public.store_orders WHERE id = p_order_id;
  END IF;

  INSERT INTO public.store_cambios(
    alumno_id, producto_id, origen_tipo, compra_id, order_id,
    variante_origen, variante_destino,
    motivo, comentario, iniciado_por, origen_solicitud,
    estado, recibido_por, recibido_en, metodo_recepcion
  ) VALUES (
    v_alumno, p_qr_devuelto_pid, 'compra', p_order_id, p_order_id,
    COALESCE(p_qr_devuelto_variante, '{}'::jsonb),
    p_qr_recibido_variante,
    p_motivo, p_comentario, 'admin', 'presencial',
    'en_deposito', v_user, now(), p_metodo
  ) RETURNING id INTO v_id;

  IF p_entregar_reemplazo AND p_qr_recibido_pid IS NOT NULL THEN
    UPDATE public.store_cambios SET
      estado = 'listo_retiro',
      reemplazo_estado = 'enviado',
      metodo_entrega_reemplazo = p_metodo,
      producto_reemplazo_id = CASE WHEN p_qr_recibido_pid <> p_qr_devuelto_pid THEN p_qr_recibido_pid ELSE NULL END,
      variante_destino = COALESCE(p_qr_recibido_variante, variante_destino)
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- =========================================================================
-- 11. RPC: definir reemplazo posterior (cuando llegó la prenda pero el
--          reemplazo se decide después)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.deposito_definir_reemplazo(
  p_cambio_id uuid,
  p_metodo public.cambio_metodo,
  p_producto_id uuid,
  p_variante jsonb,
  p_marcar_listo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_c record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_c FROM public.store_cambios WHERE id = p_cambio_id FOR UPDATE;
  IF v_c IS NULL THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  IF v_c.estado NOT IN ('en_deposito','aprobado') THEN
    RAISE EXCEPTION 'El cambio no admite definir reemplazo en estado %', v_c.estado;
  END IF;

  UPDATE public.store_cambios SET
    producto_reemplazo_id = CASE WHEN p_producto_id <> producto_id THEN p_producto_id ELSE NULL END,
    variante_destino = p_variante,
    metodo_entrega_reemplazo = p_metodo,
    reemplazo_estado = CASE WHEN p_marcar_listo THEN 'enviado' ELSE 'pendiente_envio' END,
    estado = CASE WHEN p_marcar_listo THEN 'listo_retiro' ELSE estado END
  WHERE id = p_cambio_id;
END;
$$;

-- =========================================================================
-- 12. Grants
-- =========================================================================
GRANT EXECUTE ON FUNCTION public.cancel_store_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposito_recibir_cambio(uuid, public.cambio_metodo, uuid, jsonb, boolean, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposito_registrar_cambio_presencial(uuid, uuid, public.cambio_metodo, uuid, jsonb, cambio_motivo, text, boolean, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposito_definir_reemplazo(uuid, public.cambio_metodo, uuid, jsonb, boolean) TO authenticated;
