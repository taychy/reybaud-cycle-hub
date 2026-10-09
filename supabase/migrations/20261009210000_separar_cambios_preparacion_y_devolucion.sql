-- Separación entre autorización, recepción física y preparación del cambio.
-- NO corrige existencias históricas de forma automática: requieren conciliación.
ALTER TABLE public.store_cambios
  ADD COLUMN IF NOT EXISTS preparado_at timestamptz,
  ADD COLUMN IF NOT EXISTS preparado_por uuid,
  ADD COLUMN IF NOT EXISTS metodo_preparacion public.cambio_metodo;

-- No volver a debitar stock de reemplazos preparados con la versión anterior.
UPDATE public.store_cambios
SET preparado_at = COALESCE(preparado_at, listo_retiro_at, stock_descontado_at),
    preparado_por = COALESCE(preparado_por, responsable_deposito_id)
WHERE preparado_at IS NULL
  AND stock_descontado_at IS NOT NULL
  AND tipo = 'cambio'
  AND reemplazo_estado IN ('enviado','entregado');

-- El ingreso de mercadería depende de recepción verificada; no de la etiqueta de estado.
CREATE OR REPLACE FUNCTION public.store_cambios_apply_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid;
BEGIN
  IF NEW.tipo = 'cambio'
     AND OLD.recibido_en IS NULL
     AND NEW.recibido_en IS NOT NULL
     AND NEW.stock_devuelto_at IS NULL
     AND NEW.motivo <> 'defecto' THEN
    PERFORM public._adjust_product_stock(
      NEW.producto_id, NEW.variante_origen, 1,
      'cambio_in', NEW.id, NEW.order_id,
      COALESCE(NEW.metodo_recepcion,'manual'), NEW.recibido_por
    );
    NEW.stock_devuelto_at := now();
  END IF;

  -- "enviado" es una denominación legacy: hoy significa REEMPLAZO PREPARADO.
  IF NEW.stock_descontado_at IS NULL
     AND NEW.reemplazo_estado IN ('enviado','entregado')
     AND OLD.reemplazo_estado IS DISTINCT FROM NEW.reemplazo_estado
     AND NEW.variante_destino IS NOT NULL THEN
    v_pid := COALESCE(NEW.producto_reemplazo_id,NEW.producto_id);
    PERFORM public._adjust_product_stock(
      v_pid, NEW.variante_destino, -1,
      'cambio_out', NEW.id, NEW.order_id,
      COALESCE(NEW.metodo_preparacion,NEW.metodo_entrega_reemplazo,'manual'),
      COALESCE(NEW.preparado_por,NEW.recibido_por)
    );
    NEW.stock_descontado_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Invariantes aplicadas incluso si otra pantalla/RPC intenta saltear los botones.
CREATE OR REPLACE FUNCTION public.store_cambios_guard_physical()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_staff boolean;
BEGIN
  IF NEW.tipo NOT IN ('cambio','sustitucion_falta_stock') THEN RETURN NEW; END IF;
  v_staff := COALESCE(public.has_role(auth.uid(),'admin'::app_role),false)
          OR COALESCE(public.has_role(auth.uid(),'deposito'::app_role),false)
          OR auth.role() = 'service_role';

  IF NOT v_staff AND (
       NEW.recibido_en IS DISTINCT FROM OLD.recibido_en
    OR NEW.recibido_por IS DISTINCT FROM OLD.recibido_por
    OR NEW.reemplazo_estado IS DISTINCT FROM OLD.reemplazo_estado
    OR NEW.preparado_at IS DISTINCT FROM OLD.preparado_at
    OR NEW.stock_devuelto_at IS DISTINCT FROM OLD.stock_devuelto_at
    OR NEW.stock_descontado_at IS DISTINCT FROM OLD.stock_descontado_at
    OR NEW.producto_reemplazo_id IS DISTINCT FROM OLD.producto_reemplazo_id
  ) THEN
    RAISE EXCEPTION 'Solo el personal autorizado puede registrar operaciones físicas';
  END IF;

  IF NEW.tipo = 'cambio' AND NEW.estado = 'en_deposito'
     AND OLD.estado IS DISTINCT FROM NEW.estado
     AND NEW.recibido_en IS NULL THEN
    RAISE EXCEPTION 'No puede pasar a depósito sin recepción física';
  END IF;

  IF NEW.estado IN ('listo_retiro','entregado') AND
       OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NEW.tipo = 'cambio' AND NEW.recibido_en IS NULL THEN
      RAISE EXCEPTION 'Falta recibir la prenda original';
    END IF;
    IF NEW.reemplazo_estado NOT IN ('enviado','entregado')
       AND NEW.stock_descontado_at IS NULL THEN
      RAISE EXCEPTION 'Falta preparar el reemplazo';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_store_cambios_guard_physical ON public.store_cambios;
CREATE TRIGGER trg_store_cambios_guard_physical
  BEFORE UPDATE ON public.store_cambios
  FOR EACH ROW EXECUTE FUNCTION public.store_cambios_guard_physical();

-- Acción independiente A. Idempotencia mediante FOR UPDATE + recibido_en.
CREATE OR REPLACE FUNCTION public.deposito_recibir_devolucion(
 p_cambio_id uuid, p_metodo public.cambio_metodo, p_producto_id uuid, p_variante jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.store_cambios%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::app_role)
                             OR public.has_role(v_uid,'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  IF c.tipo <> 'cambio' THEN RAISE EXCEPTION 'No requiere devolución física'; END IF;
  IF c.recibido_en IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ya_recibido',true); END IF;
  IF c.estado NOT IN ('aprobado','en_deposito') THEN RAISE EXCEPTION 'El cambio no está aprobado'; END IF;
  IF p_producto_id IS DISTINCT FROM c.producto_id THEN RAISE EXCEPTION 'La prenda no corresponde al cambio'; END IF;
  IF c.variante_origen IS NOT NULL AND c.variante_origen <> '{}'::jsonb AND
    public._build_variant_key(c.producto_id,COALESCE(p_variante,'{}'::jsonb))
    IS DISTINCT FROM public._build_variant_key(c.producto_id,c.variante_origen) THEN
      RAISE EXCEPTION 'Talle o color no coinciden con la devolución solicitada';
  END IF;

  UPDATE public.store_cambios SET
    recibido_en=now(), recibido_por=v_uid, metodo_recepcion=p_metodo,
    variante_origen=CASE WHEN variante_origen IS NULL OR variante_origen='{}'::jsonb
                   THEN COALESCE(p_variante,'{}'::jsonb) ELSE variante_origen END,
    estado=CASE WHEN reemplazo_estado IN ('enviado','entregado') OR preparado_at IS NOT NULL
                THEN 'listo_retiro'::public.cambio_estado
                ELSE 'en_deposito'::public.cambio_estado END,
    historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
       'evento','devolucion_recibida','at',now(),'by',v_uid,'metodo',p_metodo,
       'nota',CASE WHEN c.stock_devuelto_at IS NOT NULL
                 THEN 'Ingreso preexistente: recepción confirmada sin nuevo movimiento de stock'
                 WHEN c.motivo='defecto' THEN 'Prenda defectuosa: no reingresa a stock vendible'
                 ELSE 'Recepción física confirmada' END))
  WHERE id=p_cambio_id;
  RETURN jsonb_build_object('ok',true,'ya_recibido',false);
END;
$$;

-- Acción independiente B. Descuento/reserva única al preparar, sin pedir devolución.
CREATE OR REPLACE FUNCTION public.deposito_preparar_reemplazo(
 p_cambio_id uuid, p_metodo public.cambio_metodo, p_producto_id uuid, p_variante jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.store_cambios%ROWTYPE;
        v_pid uuid; v_key text; v_available integer;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::app_role)
                             OR public.has_role(v_uid,'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO c FROM public.store_cambios WHERE id=p_cambio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  IF c.tipo NOT IN ('cambio','sustitucion_falta_stock') THEN
    RAISE EXCEPTION 'Este registro no admite reemplazo';
  END IF;
  IF c.reemplazo_estado IN ('enviado','entregado') OR c.preparado_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'ya_preparado',true);
  END IF;
  IF c.estado NOT IN ('aprobado','en_deposito') THEN RAISE EXCEPTION 'El cambio no está aprobado'; END IF;
  IF p_producto_id IS NULL THEN RAISE EXCEPTION 'Falta el producto de reemplazo'; END IF;
  v_pid := COALESCE(c.producto_reemplazo_id,c.producto_id);

  IF c.tipo = 'sustitucion_falta_stock' OR c.variante_destino IS NOT NULL THEN
    IF p_producto_id IS DISTINCT FROM v_pid OR
       public._build_variant_key(v_pid,COALESCE(p_variante,'{}'::jsonb))
        IS DISTINCT FROM public._build_variant_key(v_pid,COALESCE(c.variante_destino,'{}'::jsonb)) THEN
      RAISE EXCEPTION 'El producto o la variante no coinciden con el reemplazo acordado';
    END IF;
  END IF;

  IF c.stock_descontado_at IS NULL THEN
    v_key := public._build_variant_key(p_producto_id,COALESCE(p_variante,'{}'::jsonb));
    v_available := public._stock_disponible(p_producto_id,v_key);
    IF v_available < 1 THEN RAISE EXCEPTION 'No hay stock disponible de ese reemplazo'; END IF;
  END IF;

  UPDATE public.store_cambios SET
    producto_reemplazo_id=CASE WHEN tipo='sustitucion_falta_stock' THEN producto_reemplazo_id
      WHEN p_producto_id<>producto_id THEN p_producto_id ELSE NULL END,
    variante_destino=CASE WHEN tipo='sustitucion_falta_stock' THEN variante_destino
                         ELSE COALESCE(p_variante,variante_destino) END,
    preparado_at=now(), preparado_por=v_uid, metodo_preparacion=p_metodo,
    metodo_entrega_reemplazo=p_metodo,
    reemplazo_estado='enviado',
    estado=CASE WHEN tipo='sustitucion_falta_stock' OR recibido_en IS NOT NULL
       THEN 'listo_retiro'::public.cambio_estado ELSE estado END,
    historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'evento','reemplazo_preparado','at',now(),'by',v_uid,'metodo',p_metodo,
      'nota',CASE WHEN c.tipo='cambio' AND c.recibido_en IS NULL
                  THEN 'Reemplazo preparado; devolución pendiente'
                  ELSE 'Reemplazo preparado para el alumno' END))
  WHERE id=p_cambio_id;
  RETURN jsonb_build_object('ok',true,'ya_preparado',false);
END;
$$;

-- Contratos existentes redirigidos a las operaciones independientes.
CREATE OR REPLACE FUNCTION public.deposito_recibir_cambio(
 p_cambio_id uuid, p_metodo public.cambio_metodo, p_qr_devuelto_pid uuid,
 p_qr_devuelto_variante jsonb, p_entregar_reemplazo boolean,
 p_qr_recibido_pid uuid, p_qr_recibido_variante jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.deposito_recibir_devolucion(p_cambio_id,p_metodo,p_qr_devuelto_pid,p_qr_devuelto_variante);
  IF p_entregar_reemplazo THEN
    PERFORM public.deposito_preparar_reemplazo(p_cambio_id,p_metodo,p_qr_recibido_pid,p_qr_recibido_variante);
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.deposito_definir_reemplazo(
 p_cambio_id uuid, p_metodo public.cambio_metodo, p_producto_id uuid,
 p_variante jsonb, p_marcar_listo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT p_marcar_listo THEN RAISE EXCEPTION 'Usá Preparar reemplazo para registrar la operación física'; END IF;
  PERFORM public.deposito_preparar_reemplazo(p_cambio_id,p_metodo,p_producto_id,p_variante);
END;
$$;

-- Las transiciones de estado no certifican hechos físicos.
CREATE OR REPLACE FUNCTION public.transition_cambio_estado(
 p_id uuid, p_nuevo_estado public.cambio_estado, p_nota text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.store_cambios%ROWTYPE;
  admin_ bool; deposito_ bool; owner_ bool;
BEGIN
  SELECT * INTO c FROM public.store_cambios WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
  admin_ := public.has_role(auth.uid(),'admin'::app_role);
  deposito_ := public.has_role(auth.uid(),'deposito'::app_role);
  owner_ := EXISTS (SELECT 1 FROM public.alumnos WHERE id=c.alumno_id AND user_id=auth.uid());

  IF owner_ AND NOT admin_ AND NOT deposito_ THEN
    IF NOT (p_nuevo_estado='cancelado' AND c.estado='solicitado') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  ELSIF NOT admin_ AND NOT deposito_ THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF c.tipo IN ('cambio','sustitucion_falta_stock')
     AND p_nuevo_estado IN ('en_deposito','listo_retiro') THEN
    RAISE EXCEPTION 'Para pasar de estado registrá la recepción y preparación en Ventas > Pedidos';
  END IF;
  IF deposito_ AND NOT admin_ AND p_nuevo_estado <> 'entregado' THEN
    RAISE EXCEPTION 'Depósito sólo puede confirmar entrega desde esta acción';
  END IF;

  UPDATE public.store_cambios SET
    estado=p_nuevo_estado,
    entregado_at=CASE WHEN p_nuevo_estado='entregado' AND entregado_at IS NULL THEN now() ELSE entregado_at END,
    cerrado_at=CASE WHEN p_nuevo_estado IN ('entregado','rechazado','cancelado')
                    AND cerrado_at IS NULL THEN now() ELSE cerrado_at END,
    historial=COALESCE(historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'estado',p_nuevo_estado,'at',now(),'by',auth.uid(),'nota',p_nota))
  WHERE id=p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_aviso_cambio(
 p_cambio_id uuid,p_tipo text,p_canal text DEFAULT 'whatsapp',p_mensaje text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin'::app_role)
                                 OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_tipo NOT IN ('estado','recordatorio_devolucion') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  UPDATE public.store_cambios SET historial=COALESCE(historial,'[]'::jsonb)||
    jsonb_build_array(jsonb_build_object('evento','aviso_enviado',
      'tipo',p_tipo,'canal',p_canal,'at',now(),'by',auth.uid(),
      'nota','El operador confirmó el envío manual','mensaje',left(p_mensaje,1000)))
  WHERE id=p_cambio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cambio no encontrado'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.deposito_recibir_devolucion(uuid,public.cambio_metodo,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.deposito_preparar_reemplazo(uuid,public.cambio_metodo,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.registrar_aviso_cambio(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.deposito_recibir_devolucion(uuid,public.cambio_metodo,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.deposito_preparar_reemplazo(uuid,public.cambio_metodo,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_aviso_cambio(uuid,text,text,text) TO authenticated,service_role;
