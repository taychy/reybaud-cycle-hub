ALTER TABLE public.emisores_fiscales ADD COLUMN IF NOT EXISTS facturacion_automatica_desde timestamptz;
ALTER TABLE public.suscripciones ADD COLUMN IF NOT EXISTS pago_confirmado_at timestamptz,
  ADD COLUMN IF NOT EXISTS pago_confirmado_por uuid;
COMMENT ON COLUMN public.suscripciones.pago_confirmado_at IS 'Fecha/hora real del pago manual confirmada explícitamente por un admin. Única fuente para facturar mensualidades manuales; nunca updated_at.';

CREATE OR REPLACE FUNCTION public.set_facturacion_automatica_emisor(p_emisor_id uuid, p_activa boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role text; v_nombre text; v_prev boolean; v_desde timestamptz;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT nombre_fiscal, facturacion_automatica INTO v_nombre, v_prev FROM public.emisores_fiscales WHERE id = p_emisor_id AND activo FOR UPDATE;
  IF v_nombre IS NULL THEN RAISE EXCEPTION 'Emisor inexistente o inactivo'; END IF;
  UPDATE public.emisores_fiscales SET facturacion_automatica = p_activa,
    facturacion_automatica_desde = CASE WHEN p_activa THEN (CASE WHEN v_prev THEN facturacion_automatica_desde ELSE now() END) ELSE NULL END
  WHERE id = p_emisor_id RETURNING facturacion_automatica_desde INTO v_desde;
  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role,
          CASE WHEN p_activa THEN 'facturacion_automatica_emisor_activada' ELSE 'facturacion_automatica_emisor_desactivada' END,
          'emisores_fiscales', p_emisor_id::text, jsonb_build_object('emisor', v_nombre, 'desde', v_desde, 'anterior', v_prev));
  RETURN jsonb_build_object('emisor_id', p_emisor_id, 'facturacion_automatica', p_activa, 'desde', v_desde);
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_facturacion_auto(p_limit integer DEFAULT 5)
 RETURNS SETOF facturacion_cola LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.facturacion_cola c
  SET auto_estado = 'error_reintentable', auto_lock_at = NULL,
      auto_ultimo_error = 'Bloqueo vencido sin resultado', auto_proximo_intento_at = now()
  WHERE c.auto_estado = 'emitiendo' AND c.auto_lock_at < now() - interval '30 minutes'
    AND c.auto_intentos < 3
    AND NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.facturacion_cola_id = c.id
                    AND (f.estado IN ('emitiendo','emitida') OR f.cae IS NOT NULL OR f.recuperacion_estado = 'incierta'));

  RETURN QUERY
  UPDATE public.facturacion_cola c
  SET auto_estado = 'emitiendo', auto_lock_at = now(), auto_intentos = c.auto_intentos + 1, auto_ultimo_intento_at = now()
  WHERE c.id IN (
    SELECT c2.id FROM public.facturacion_cola c2
    JOIN public.emisores_fiscales e ON e.id = c2.emisor_resuelto_id
    JOIN public.emisor_segmento_config s ON s.emisor_id = e.id AND s.segmento = public._fact_segmento_norm(c2.segmento)
    WHERE c2.estado = 'pendiente' AND c2.ingreso = 'automatico'
      AND c2.auto_estado IN ('pendiente','error_reintentable')
      AND c2.auto_intentos < 3
      AND coalesce(c2.auto_proximo_intento_at, '-infinity'::timestamptz) <= now()
      AND upper(coalesce(c2.moneda,'ARS')) = 'ARS'
      AND c2.pagado_at IS NOT NULL
      AND e.activo AND e.facturacion_automatica AND e.facturacion_automatica_desde IS NOT NULL
      AND s.habilitado AND s.auto_habilitado AND s.auto_desde IS NOT NULL
      AND c2.pagado_at >= greatest(s.auto_desde, e.facturacion_automatica_desde)
      AND c2.created_at >= greatest(s.auto_desde, e.facturacion_automatica_desde)
    ORDER BY c2.pagado_at
    LIMIT greatest(1, least(p_limit, 20))
    FOR UPDATE OF c2 SKIP LOCKED
  )
  RETURNING c.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_facturacion_auto(p_cola_id uuid, p_resultado text, p_error text DEFAULT NULL::text, p_retryable boolean DEFAULT false, p_factura_id uuid DEFAULT NULL::uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_int int; v_estado text; v_no_consume boolean := false;
BEGIN
  SELECT auto_intentos INTO v_int FROM public.facturacion_cola WHERE id = p_cola_id FOR UPDATE;
  IF p_resultado = 'facturada' THEN v_estado := 'facturada';
  ELSIF p_resultado = 'requiere_datos_fiscales' THEN v_estado := 'requiere_datos_fiscales'; v_no_consume := true;
  ELSIF p_resultado = 'requiere_revision_emisor' THEN v_estado := 'requiere_revision_emisor'; v_no_consume := true;
  ELSIF p_resultado = 'incierta' THEN v_estado := 'emitiendo';
  ELSIF p_retryable AND coalesce(v_int,0) < 3 THEN v_estado := 'error_reintentable';
  ELSE v_estado := 'error_manual';
  END IF;

  UPDATE public.facturacion_cola SET
    auto_estado = CASE WHEN estado = 'facturada' THEN 'facturada' ELSE v_estado END,
    auto_intentos = CASE WHEN v_no_consume THEN greatest(coalesce(auto_intentos,1) - 1, 0) ELSE auto_intentos END,
    auto_lock_at = CASE WHEN v_estado = 'emitiendo' THEN auto_lock_at ELSE NULL END,
    auto_ultimo_error = left(p_error, 1000),
    auto_motivo = CASE WHEN v_estado IN ('facturada') THEN NULL ELSE coalesce(left(p_error, 500), auto_motivo) END,
    auto_proximo_intento_at = CASE WHEN v_estado = 'error_reintentable'
      THEN now() + (interval '15 minutes' * power(4, greatest(coalesce(v_int,1),1) - 1)) ELSE NULL END
  WHERE id = p_cola_id;

  INSERT INTO public.facturacion_auto_log(cola_id, factura_id, evento, detalle)
  VALUES (p_cola_id, p_factura_id, v_estado, jsonb_build_object('resultado', p_resultado, 'error', left(p_error, 1000), 'intento', v_int, 'consume_intento', NOT v_no_consume));
  RETURN v_estado;
END;
$function$;

-- Mensualidades: MP aprobado, o pago manual con confirmación explícita (pago_confirmado_at)
CREATE OR REPLACE FUNCTION public.enqueue_suscripcion_facturacion()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pago text; v_monto numeric; v_plan_nombre text; v_plan_precio numeric; v_plan_moneda text;
  v_nombre text; v_doc text; v_cuenta uuid; v_pagado timestamptz;
BEGIN
  IF NEW.mp_status = 'approved' AND NEW.mp_payment_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.mp_status IS DISTINCT FROM 'approved' OR OLD.mp_payment_id IS DISTINCT FROM NEW.mp_payment_id) THEN
    v_pago := NEW.mp_payment_id; v_pagado := now();
  ELSIF NEW.mp_payment_id IS NULL AND NEW.pago_confirmado_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.pago_confirmado_at IS NULL) THEN
    v_pago := 'manual:' || NEW.id::text; v_pagado := NEW.pago_confirmado_at;
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    SELECT p.nombre, p.precio, p.moneda INTO v_plan_nombre, v_plan_precio, v_plan_moneda FROM public.planes p WHERE p.id = NEW.plan_id;
    v_monto := COALESCE(NEW.precio_final, NEW.precio_base, v_plan_precio, 0);
    IF v_monto <= 0 THEN RETURN NEW; END IF;
    SELECT COALESCE(NULLIF(TRIM(a.nombre_fiscal),''), NULLIF(TRIM(CONCAT(a.nombre,' ',a.apellido)),''), '—'), a.documento
      INTO v_nombre, v_doc FROM public.alumnos a WHERE a.id = NEW.alumno_id;
    v_cuenta := NEW.cuenta_mp_id;

    INSERT INTO public.facturacion_cola (
      source, pago_id, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto,
      monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, periodo_pago, periodo_operativo, ingreso, cuenta_mp_id
    ) VALUES (
      'suscripcion', v_pago, 'suscripcion', NEW.id, NEW.alumno_id, COALESCE(v_nombre,'—'), v_doc,
      CONCAT('Suscripción ', COALESCE(v_plan_nombre,'')), v_monto, COALESCE(v_plan_moneda,'ARS'), 'escuela',
      COALESCE(NEW.metodo_pago, 'mercadopago'), NEW.origen_registro, v_pagado,
      date_trunc('month', (v_pagado AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
      COALESCE(date_trunc('month', NEW.fecha_inicio)::date, date_trunc('month', (v_pagado AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date),
      'automatico', v_cuenta
    )
    ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'facturacion_cola suscripcion %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_suscripciones_facturacion ON public.suscripciones;
CREATE TRIGGER trg_suscripciones_facturacion AFTER INSERT OR UPDATE OF mp_status, mp_payment_id, estado, pago_confirmado_at
  ON public.suscripciones FOR EACH ROW EXECUTE FUNCTION public.enqueue_suscripcion_facturacion();

CREATE OR REPLACE FUNCTION public.confirmar_pago_mensualidad_manual(p_suscripcion_id uuid, p_pagado_at timestamptz)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_prev timestamptz; v_mp text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_pagado_at IS NULL OR p_pagado_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Indicá la fecha y hora real del pago (no futura)';
  END IF;
  SELECT pago_confirmado_at, mp_payment_id INTO v_prev, v_mp FROM public.suscripciones WHERE id = p_suscripcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mensualidad inexistente'; END IF;
  IF v_mp IS NOT NULL THEN RAISE EXCEPTION 'Esta mensualidad se cobró por Mercado Pago; no requiere confirmación manual'; END IF;
  IF v_prev IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'ya_confirmado', true, 'pago_confirmado_at', v_prev);
  END IF;
  UPDATE public.suscripciones SET pago_confirmado_at = p_pagado_at, pago_confirmado_por = auth.uid() WHERE id = p_suscripcion_id;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'admin', 'mensualidad_pago_manual_confirmado', 'suscripciones', p_suscripcion_id::text,
          jsonb_build_object('pagado_at', p_pagado_at));
  RETURN jsonb_build_object('ok', true, 'pago_confirmado_at', p_pagado_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.confirmar_pago_mensualidad_manual(uuid, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_pago_mensualidad_manual(uuid, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_facturacion_auto(integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_facturacion_auto(uuid, text, text, boolean, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_facturacion_auto(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_facturacion_auto(uuid, text, text, boolean, uuid) TO service_role;