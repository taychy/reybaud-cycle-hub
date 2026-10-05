-- ============================================================
-- Facturación automática — Fase 1 segura (apagada por defecto)
-- ============================================================

-- 1) Interruptor por emisor + tipo de cobro, con fecha de activación
ALTER TABLE public.emisor_segmento_config
  ADD COLUMN IF NOT EXISTS auto_habilitado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_desde timestamptz,
  ADD COLUMN IF NOT EXISTS auto_actualizado_por uuid,
  ADD COLUMN IF NOT EXISTS auto_actualizado_at timestamptz;

-- 2) Medio de pago -> cuenta receptora / emisor (configuración explícita)
CREATE TABLE IF NOT EXISTS public.facturacion_medio_cuenta (
  metodo_pago text PRIMARY KEY,
  cuenta_mp_id uuid REFERENCES public.cuentas_mp(id),
  emisor_fiscal_id uuid REFERENCES public.emisores_fiscales(id),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturacion_medio_cuenta TO authenticated;
GRANT ALL ON public.facturacion_medio_cuenta TO service_role;
ALTER TABLE public.facturacion_medio_cuenta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gestionan medio-cuenta de facturacion" ON public.facturacion_medio_cuenta
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Bitácora de la automatización
CREATE TABLE IF NOT EXISTS public.facturacion_auto_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cola_id uuid,
  factura_id uuid,
  evento text NOT NULL,
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facturacion_auto_log_cola_idx ON public.facturacion_auto_log(cola_id, created_at DESC);
GRANT SELECT ON public.facturacion_auto_log TO authenticated;
GRANT ALL ON public.facturacion_auto_log TO service_role;
ALTER TABLE public.facturacion_auto_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen bitacora facturacion auto" ON public.facturacion_auto_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Token interno del worker (solo service_role / cron)
CREATE TABLE IF NOT EXISTS public.facturacion_worker_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.facturacion_worker_config TO service_role;
ALTER TABLE public.facturacion_worker_config ENABLE ROW LEVEL SECURITY;

-- 5) Cola: datos de automatización
ALTER TABLE public.facturacion_cola
  ADD COLUMN IF NOT EXISTS ingreso text NOT NULL DEFAULT 'rebuild',
  ADD COLUMN IF NOT EXISTS cuenta_mp_id uuid,
  ADD COLUMN IF NOT EXISTS emisor_resuelto_id uuid REFERENCES public.emisores_fiscales(id),
  ADD COLUMN IF NOT EXISTS emisor_origen text,
  ADD COLUMN IF NOT EXISTS emisor_override_id uuid REFERENCES public.emisores_fiscales(id),
  ADD COLUMN IF NOT EXISTS emisor_override_por uuid,
  ADD COLUMN IF NOT EXISTS emisor_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS emisor_override_motivo text,
  ADD COLUMN IF NOT EXISTS servicio_desde date,
  ADD COLUMN IF NOT EXISTS servicio_hasta date,
  ADD COLUMN IF NOT EXISTS fecha_comprobante date,
  ADD COLUMN IF NOT EXISTS auto_estado text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS auto_motivo text,
  ADD COLUMN IF NOT EXISTS auto_intentos int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_proximo_intento_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_ultimo_intento_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_ultimo_error text,
  ADD COLUMN IF NOT EXISTS auto_lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_reevaluar_at timestamptz;

ALTER TABLE public.facturacion_cola
  ADD CONSTRAINT facturacion_cola_auto_estado_chk CHECK (auto_estado IN (
    'manual','pendiente','emitiendo','facturada','requiere_datos_fiscales',
    'requiere_revision_emisor','moneda_no_soportada_automaticamente',
    'error_reintentable','error_manual','excluida','anulada'));
ALTER TABLE public.facturacion_cola
  ADD CONSTRAINT facturacion_cola_ingreso_chk CHECK (ingreso IN ('rebuild','automatico'));
CREATE INDEX IF NOT EXISTS facturacion_cola_auto_idx ON public.facturacion_cola(auto_estado, auto_proximo_intento_at) WHERE estado = 'pendiente';

-- 6) Facturas: bloqueo de emisión, comprobante esperado y recuperación
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS emision_lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS emision_intentos int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbte_esperado_tipo int,
  ADD COLUMN IF NOT EXISTS cbte_esperado_pto int,
  ADD COLUMN IF NOT EXISTS cbte_esperado_nro int,
  ADD COLUMN IF NOT EXISTS recuperacion_estado text,
  ADD COLUMN IF NOT EXISTS servicio_desde date,
  ADD COLUMN IF NOT EXISTS servicio_hasta date,
  ADD COLUMN IF NOT EXISTS fecha_comprobante date;
ALTER TABLE public.facturas
  ADD CONSTRAINT facturas_recuperacion_estado_chk CHECK (recuperacion_estado IS NULL OR recuperacion_estado IN ('incierta','recuperada','sin_comprobante'));
CREATE UNIQUE INDEX IF NOT EXISTS facturas_comprobante_uidx
  ON public.facturas(emisor_id, tipo_comprobante, numero_comprobante)
  WHERE numero_comprobante IS NOT NULL;

-- ============================================================
-- Helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public._fact_segmento_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(trim(coalesce(p,'')))
    WHEN 'eventos' THEN 'viajes' WHEN 'evento' THEN 'viajes' WHEN 'viajes' THEN 'viajes'
    WHEN 'escuela' THEN 'escuela' WHEN 'tienda' THEN 'tienda' ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public._fact_unidades(p_seg text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_seg
    WHEN 'escuela' THEN ARRAY['suscripcion_escuela']
    WHEN 'viajes' THEN ARRAY['viaje_camp','evento']
    WHEN 'tienda' THEN ARRAY['tienda','preventa']
    ELSE ARRAY[]::text[] END
$$;

-- Resolución del emisor fiscal. Nunca usa un emisor "por defecto global".
-- Orden: override manual > emisor explícito del flujo > configuración del medio de pago
--        > cuenta MP receptora (ruteo por unidad, luego emisor de la cuenta)
--        > único emisor habilitado para el segmento > revisión manual.
CREATE OR REPLACE FUNCTION public.resolver_emisor_facturacion(
  p_segmento text, p_metodo_pago text, p_cuenta_mp_id uuid,
  p_emisor_explicito uuid DEFAULT NULL, p_override uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_seg text := public._fact_segmento_norm(p_segmento);
  v_metodo text := lower(trim(coalesce(p_metodo_pago,'')));
  v_emisor uuid; v_origen text; v_cuenta uuid; v_n int;
  v_medio public.facturacion_medio_cuenta%ROWTYPE; v_has_medio boolean := false;
BEGIN
  IF p_override IS NOT NULL THEN
    v_emisor := p_override; v_origen := 'override_manual';
  ELSIF p_emisor_explicito IS NOT NULL THEN
    v_emisor := p_emisor_explicito; v_origen := 'emisor_del_flujo';
  ELSE
    SELECT * INTO v_medio FROM public.facturacion_medio_cuenta WHERE metodo_pago = v_metodo;
    v_has_medio := FOUND;
    IF v_has_medio AND v_medio.emisor_fiscal_id IS NOT NULL THEN
      v_emisor := v_medio.emisor_fiscal_id; v_origen := 'medio_de_pago'; v_cuenta := v_medio.cuenta_mp_id;
    ELSE
      IF v_has_medio AND v_medio.cuenta_mp_id IS NOT NULL THEN
        v_cuenta := v_medio.cuenta_mp_id;
      ELSIF v_metodo IN ('mercadopago','mp','mercado_pago','tarjeta') THEN
        v_cuenta := p_cuenta_mp_id;
      END IF;

      IF v_cuenta IS NOT NULL THEN
        SELECT count(DISTINCT r.emisor_fiscal_id) INTO v_n
        FROM public.cuenta_mp_routing r
        WHERE r.cuenta_mp_id = v_cuenta AND r.activa AND r.emisor_fiscal_id IS NOT NULL
          AND r.unidad_negocio::text = ANY(public._fact_unidades(v_seg));
        IF v_n > 1 THEN
          RETURN jsonb_build_object('emisor_id', NULL, 'origen', NULL, 'cuenta_mp_id', v_cuenta,
            'motivo', 'La cuenta receptora tiene más de un emisor configurado para este tipo de cobro');
        ELSIF v_n = 1 THEN
          SELECT r.emisor_fiscal_id INTO v_emisor FROM public.cuenta_mp_routing r
          WHERE r.cuenta_mp_id = v_cuenta AND r.activa AND r.emisor_fiscal_id IS NOT NULL
            AND r.unidad_negocio::text = ANY(public._fact_unidades(v_seg))
          LIMIT 1;
          v_origen := 'cuenta_receptora_ruteo';
        ELSE
          SELECT emisor_fiscal_default_id INTO v_emisor FROM public.cuentas_mp WHERE id = v_cuenta;
          v_origen := 'cuenta_receptora';
        END IF;
        IF v_emisor IS NULL THEN
          RETURN jsonb_build_object('emisor_id', NULL, 'origen', NULL, 'cuenta_mp_id', v_cuenta,
            'motivo', 'La cuenta receptora no tiene emisor fiscal configurado');
        END IF;
      ELSE
        SELECT count(*) INTO v_n
        FROM public.emisor_segmento_config c JOIN public.emisores_fiscales e ON e.id = c.emisor_id
        WHERE c.segmento = v_seg AND c.habilitado AND e.activo;
        IF v_n = 1 THEN
          SELECT c.emisor_id INTO v_emisor
          FROM public.emisor_segmento_config c JOIN public.emisores_fiscales e ON e.id = c.emisor_id
          WHERE c.segmento = v_seg AND c.habilitado AND e.activo;
          v_origen := 'unico_emisor_del_segmento';
        ELSE
          RETURN jsonb_build_object('emisor_id', NULL, 'origen', NULL, 'cuenta_mp_id', NULL,
            'motivo', format('Sin cuenta receptora identificable (medio: %s) y %s emisores habilitados para %s',
              coalesce(nullif(v_metodo,''),'desconocido'), v_n, coalesce(v_seg,'tipo de cobro desconocido')));
        END IF;
      END IF;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.emisores_fiscales WHERE id = v_emisor AND activo) THEN
    RETURN jsonb_build_object('emisor_id', NULL, 'origen', v_origen, 'cuenta_mp_id', v_cuenta,
      'motivo', 'El emisor resuelto no existe o está inactivo');
  END IF;
  RETURN jsonb_build_object('emisor_id', v_emisor, 'origen', v_origen, 'cuenta_mp_id', v_cuenta, 'motivo', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_emisor_facturacion(text,text,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_emisor_facturacion(text,text,uuid,uuid,uuid) TO authenticated, service_role;

-- Evaluación de una fila de la cola (emisor, período, bloqueos y elegibilidad)
CREATE OR REPLACE FUNCTION public._fact_cola_evaluar(r public.facturacion_cola)
RETURNS public.facturacion_cola
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tz text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_seg text := public._fact_segmento_norm(r.segmento);
  v_res jsonb; v_doc jsonb; v_emisor_expl uuid;
  v_desde date; v_hasta date; v_mes date;
  v_doc_raw text; v_tipo_doc text;
  v_cfg public.emisor_segmento_config%ROWTYPE; v_em public.emisores_fiscales%ROWTYPE;
  v_rango int;
BEGIN
  IF r.auto_estado IN ('emitiendo','facturada') THEN RETURN r; END IF;
  IF r.estado IN ('facturada','excluida','anulada') THEN r.auto_estado := r.estado; RETURN r; END IF;

  v_mes := date_trunc('month', (r.pagado_at AT TIME ZONE v_tz))::date;

  IF r.referencia_tipo = 'suscripcion' THEN
    SELECT s.cuenta_mp_id, s.fecha_inicio, s.fecha_fin INTO r.cuenta_mp_id, v_desde, v_hasta
    FROM public.suscripciones s WHERE s.id = r.referencia_id;
  ELSIF r.referencia_tipo IN ('reservation_payment','evento') THEN
    SELECT rp.cuenta_mp_id, e.date, coalesce(e.end_date, e.date) INTO r.cuenta_mp_id, v_desde, v_hasta
    FROM public.reservation_payments rp
    LEFT JOIN public.event_reservations er ON er.id = rp.reservation_id
    LEFT JOIN public.events e ON e.id = er.event_id
    WHERE rp.id = r.referencia_id;
  ELSIF r.referencia_tipo = 'pedido_tienda' THEN
    SELECT o.cuenta_mp_id, o.tienda_emisor_id INTO r.cuenta_mp_id, v_emisor_expl
    FROM public.store_orders o WHERE o.id = r.referencia_id;
  ELSIF r.referencia_tipo = 'pedido' THEN
    SELECT p.cuenta_mp_id INTO r.cuenta_mp_id FROM public.store_preorders p WHERE p.id = r.referencia_id;
  END IF;

  r.servicio_desde := coalesce(v_desde, v_mes);
  r.servicio_hasta := coalesce(v_hasta, (v_mes + interval '1 month - 1 day')::date);
  IF r.servicio_hasta < r.servicio_desde THEN r.servicio_hasta := r.servicio_desde; END IF;
  r.fecha_comprobante := (r.pagado_at AT TIME ZONE v_tz)::date;

  v_res := public.resolver_emisor_facturacion(r.segmento, r.metodo_pago, r.cuenta_mp_id, v_emisor_expl, r.emisor_override_id);
  r.emisor_resuelto_id := nullif(v_res->>'emisor_id','')::uuid;
  r.emisor_origen := v_res->>'origen';
  r.auto_motivo := NULL;

  IF upper(coalesce(r.moneda,'ARS')) <> 'ARS' THEN
    r.auto_estado := 'moneda_no_soportada_automaticamente';
    r.auto_motivo := format('Moneda %s: la facturación automática solo admite ARS', r.moneda);
    RETURN r;
  END IF;

  IF r.emisor_resuelto_id IS NULL THEN
    r.auto_estado := 'requiere_revision_emisor';
    r.auto_motivo := v_res->>'motivo';
    RETURN r;
  END IF;

  IF r.alumno_id IS NOT NULL THEN
    SELECT a.documento, a.tipo_documento INTO v_doc_raw, v_tipo_doc FROM public.alumnos a WHERE a.id = r.alumno_id;
  END IF;
  v_doc := public.clasificar_documento_fiscal(coalesce(nullif(trim(v_doc_raw),''), r.cliente_cuit), v_tipo_doc);
  IF coalesce(v_doc->>'clase','') <> 'ok' THEN
    r.auto_estado := 'requiere_datos_fiscales';
    r.auto_motivo := coalesce(v_doc->>'mensaje', 'Falta DNI o CUIT válido');
    RETURN r;
  END IF;

  SELECT * INTO v_em FROM public.emisores_fiscales WHERE id = r.emisor_resuelto_id;
  SELECT * INTO v_cfg FROM public.emisor_segmento_config WHERE emisor_id = r.emisor_resuelto_id AND segmento = v_seg;

  IF NOT coalesce(v_cfg.habilitado, false) THEN
    r.auto_estado := 'requiere_revision_emisor';
    r.auto_motivo := 'El emisor resuelto no está habilitado para este tipo de cobro';
    RETURN r;
  END IF;

  IF NOT coalesce(v_em.facturacion_automatica, false) OR NOT coalesce(v_cfg.auto_habilitado, false) OR v_cfg.auto_desde IS NULL THEN
    r.auto_estado := 'manual';
    r.auto_motivo := 'Facturación automática apagada para este emisor y tipo de cobro';
    RETURN r;
  END IF;

  IF r.ingreso <> 'automatico' OR r.pagado_at < v_cfg.auto_desde OR r.created_at < v_cfg.auto_desde THEN
    r.auto_estado := 'manual';
    r.auto_motivo := 'Cobro anterior a la activación: se factura a mano';
    RETURN r;
  END IF;

  IF NOT coalesce(v_em.tiene_credenciales, false) THEN
    r.auto_estado := 'error_manual';
    r.auto_motivo := 'El emisor no tiene certificado ARCA cargado';
    RETURN r;
  END IF;

  v_rango := CASE WHEN v_seg = 'tienda' THEN 5 ELSE 10 END;
  IF r.fecha_comprobante < v_today - v_rango OR r.fecha_comprobante > v_today THEN
    r.auto_estado := 'error_manual';
    r.auto_motivo := format('fecha_fuera_de_rango_arca: el cobro es del %s y ARCA admite hasta %s días atrás', to_char(r.fecha_comprobante,'DD/MM/YYYY'), v_rango);
    RETURN r;
  END IF;

  r.auto_estado := 'pendiente';
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public._fact_cola_evaluar(public.facturacion_cola) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fact_cola_evaluar(public.facturacion_cola) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_facturacion_cola_auto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN public._fact_cola_evaluar(NEW);
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('facturada','excluida','anulada') THEN
    NEW.auto_estado := NEW.estado; NEW.auto_lock_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.auto_reevaluar_at IS DISTINCT FROM OLD.auto_reevaluar_at
     OR NEW.emisor_override_id IS DISTINCT FROM OLD.emisor_override_id THEN
    RETURN public._fact_cola_evaluar(NEW);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_facturacion_cola_auto ON public.facturacion_cola;
CREATE TRIGGER trg_facturacion_cola_auto
  BEFORE INSERT OR UPDATE ON public.facturacion_cola
  FOR EACH ROW EXECUTE FUNCTION public.tg_facturacion_cola_auto();

-- Despertar al worker cuando un cobro queda listo (sin sondeo permanente)
CREATE OR REPLACE FUNCTION public.tg_facturacion_cola_wake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  IF NEW.auto_estado = 'pendiente' AND (TG_OP = 'INSERT' OR OLD.auto_estado IS DISTINCT FROM 'pendiente') THEN
    BEGIN
      SELECT token INTO v_token FROM public.facturacion_worker_config WHERE id = 1;
      IF v_token IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/facturacion-auto-worker',
          headers := jsonb_build_object('Content-Type','application/json','x-worker-token', v_token),
          body := jsonb_build_object('motivo','enqueue','cola_id', NEW.id));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'facturacion wake: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_facturacion_cola_wake ON public.facturacion_cola;
CREATE TRIGGER trg_facturacion_cola_wake
  AFTER INSERT OR UPDATE OF auto_estado ON public.facturacion_cola
  FOR EACH ROW EXECUTE FUNCTION public.tg_facturacion_cola_wake();

-- ============================================================
-- Ingreso automático a la cola
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_reservation_payment_facturacion()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_alumno_nombre text; v_alumno_doc text; v_evento_nombre text; v_pago_id text;
BEGIN
  IF NEW.status = 'validado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'validado') THEN
    BEGIN
      v_pago_id := COALESCE(NEW.mp_payment_id, 'reservation:' || NEW.id::text);
      SELECT COALESCE(NULLIF(TRIM(a.nombre_fiscal),''), NULLIF(TRIM(CONCAT(a.nombre, ' ', a.apellido)), ''), '—'), a.documento
        INTO v_alumno_nombre, v_alumno_doc
      FROM public.alumnos a WHERE a.id = NEW.alumno_id;
      SELECT e.title INTO v_evento_nombre
      FROM public.event_reservations r LEFT JOIN public.events e ON e.id = r.event_id
      WHERE r.id = NEW.reservation_id;

      INSERT INTO public.facturacion_cola (
        source, pago_id, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto,
        monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, periodo_pago, periodo_operativo, ingreso
      ) VALUES (
        'reservation_payment', v_pago_id, 'reservation_payment', NEW.id, NEW.alumno_id,
        COALESCE(v_alumno_nombre, '—'), v_alumno_doc, CONCAT('Evento ', COALESCE(v_evento_nombre, '')),
        COALESCE(NEW.amount, 0)::numeric, COALESCE(NEW.currency, 'ARS'), 'viajes',
        COALESCE(NEW.payment_method, 'efectivo'), 'reservation',
        COALESCE(NEW.reviewed_at, NEW.created_at),
        date_trunc('month', (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
        date_trunc('month', (COALESCE(NEW.reviewed_at, NEW.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
        'automatico'
      )
      ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'facturacion_cola reserva %: %', NEW.id, SQLERRM;
    END;
  END IF;

  IF NEW.anulado_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.anulado_at IS NULL) THEN
    UPDATE public.facturacion_cola
    SET estado = 'excluida',
        notas = COALESCE(notas || ' | ', '') || 'Pago anulado: ' || COALESCE(NEW.anulado_motivo, ''),
        updated_at = now()
    WHERE referencia_tipo = 'reservation_payment' AND referencia_id = NEW.id AND estado = 'pendiente';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_suscripcion_facturacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pago text; v_monto numeric; v_plan_nombre text; v_plan_precio numeric; v_plan_moneda text;
  v_nombre text; v_doc text; v_metodo text := lower(coalesce(NEW.metodo_pago,''));
BEGIN
  IF NEW.mp_status = 'approved' AND NEW.mp_payment_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.mp_status IS DISTINCT FROM 'approved' OR OLD.mp_payment_id IS DISTINCT FROM NEW.mp_payment_id) THEN
    v_pago := NEW.mp_payment_id;
  ELSIF NEW.mp_payment_id IS NULL AND NEW.estado = 'activa'
     AND (v_metodo IN ('efectivo','transferencia','manual','deposito','otro') OR v_metodo LIKE 'mp_externo_%')
     AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'activa') THEN
    v_pago := 'manual:' || NEW.id::text;
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    SELECT p.nombre, p.precio, p.moneda INTO v_plan_nombre, v_plan_precio, v_plan_moneda FROM public.planes p WHERE p.id = NEW.plan_id;
    v_monto := COALESCE(NEW.precio_final, NEW.precio_base, v_plan_precio, 0);
    IF v_monto <= 0 THEN RETURN NEW; END IF;
    SELECT COALESCE(NULLIF(TRIM(a.nombre_fiscal),''), NULLIF(TRIM(CONCAT(a.nombre,' ',a.apellido)),''), '—'), a.documento
      INTO v_nombre, v_doc FROM public.alumnos a WHERE a.id = NEW.alumno_id;

    INSERT INTO public.facturacion_cola (
      source, pago_id, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto,
      monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, periodo_pago, periodo_operativo, ingreso
    ) VALUES (
      'suscripcion', v_pago, 'suscripcion', NEW.id, NEW.alumno_id, COALESCE(v_nombre,'—'), v_doc,
      CONCAT('Suscripción ', COALESCE(v_plan_nombre,'')), v_monto, COALESCE(v_plan_moneda,'ARS'), 'escuela',
      COALESCE(NEW.metodo_pago, 'mercadopago'), NEW.origen_registro, now(),
      date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
      COALESCE(date_trunc('month', NEW.fecha_inicio)::date, date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date),
      'automatico'
    )
    ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'facturacion_cola suscripcion %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_suscripciones_facturacion ON public.suscripciones;
CREATE TRIGGER trg_suscripciones_facturacion
  AFTER INSERT OR UPDATE OF mp_status, mp_payment_id, estado ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_suscripcion_facturacion();

CREATE OR REPLACE FUNCTION public.enqueue_store_order_facturacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre text; v_doc text;
BEGIN
  IF NEW.pagado_at IS NOT NULL AND coalesce(NEW.status,'') <> 'cancelado' AND coalesce(NEW.total,0) > 0
     AND (TG_OP = 'INSERT' OR OLD.pagado_at IS NULL) THEN
    BEGIN
      IF NEW.alumno_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(TRIM(a.nombre_fiscal),''), NULLIF(TRIM(CONCAT(a.nombre,' ',a.apellido)),'')), a.documento
          INTO v_nombre, v_doc FROM public.alumnos a WHERE a.id = NEW.alumno_id;
      END IF;
      INSERT INTO public.facturacion_cola (
        source, pago_id, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto,
        monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, periodo_pago, periodo_operativo, ingreso
      ) VALUES (
        'store_order', COALESCE(NEW.mp_payment_id, 'store:' || NEW.id::text), 'pedido_tienda', NEW.id, NEW.alumno_id,
        COALESCE(v_nombre, NEW.customer_name, '—'), v_doc, CONCAT('Pedido tienda #', COALESCE(NEW.order_number::text, '')),
        NEW.total, COALESCE(NEW.currency,'ARS'), 'tienda', COALESCE(NEW.metodo_pago,'mercadopago'), NEW.origen_registro,
        NEW.pagado_at,
        date_trunc('month', (NEW.pagado_at AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
        date_trunc('month', (NEW.pagado_at AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
        'automatico'
      )
      ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'facturacion_cola pedido %: %', NEW.id, SQLERRM;
    END;
  END IF;
  IF coalesce(NEW.status,'') = 'cancelado' AND (TG_OP = 'INSERT' OR coalesce(OLD.status,'') <> 'cancelado') THEN
    UPDATE public.facturacion_cola SET estado = 'excluida',
      notas = COALESCE(notas || ' | ', '') || 'Pedido cancelado', updated_at = now()
    WHERE referencia_tipo = 'pedido_tienda' AND referencia_id = NEW.id AND estado = 'pendiente'
      AND auto_estado <> 'emitiendo';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_store_orders_facturacion ON public.store_orders;
CREATE TRIGGER trg_store_orders_facturacion
  AFTER INSERT OR UPDATE OF pagado_at, status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_store_order_facturacion();

-- ============================================================
-- Worker (solo service_role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_facturacion_auto(p_limit int DEFAULT 5)
RETURNS SETOF public.facturacion_cola
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Liberar bloqueos viejos cuya factura no quedó en emisión incierta
  UPDATE public.facturacion_cola c
  SET auto_estado = 'error_reintentable', auto_lock_at = NULL,
      auto_ultimo_error = 'Bloqueo vencido sin resultado', auto_proximo_intento_at = now()
  WHERE c.auto_estado = 'emitiendo' AND c.auto_lock_at < now() - interval '30 minutes'
    AND NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.facturacion_cola_id = c.id
                    AND (f.estado = 'emitiendo' OR f.recuperacion_estado = 'incierta'));

  RETURN QUERY
  UPDATE public.facturacion_cola c
  SET auto_estado = 'emitiendo', auto_lock_at = now(), auto_intentos = c.auto_intentos + 1, auto_ultimo_intento_at = now()
  WHERE c.id IN (
    SELECT c2.id FROM public.facturacion_cola c2
    JOIN public.emisores_fiscales e ON e.id = c2.emisor_resuelto_id
    JOIN public.emisor_segmento_config s ON s.emisor_id = e.id AND s.segmento = public._fact_segmento_norm(c2.segmento)
    WHERE c2.estado = 'pendiente' AND c2.ingreso = 'automatico'
      AND c2.auto_estado IN ('pendiente','error_reintentable')
      AND coalesce(c2.auto_proximo_intento_at, '-infinity'::timestamptz) <= now()
      AND upper(coalesce(c2.moneda,'ARS')) = 'ARS'
      AND e.activo AND e.facturacion_automatica AND s.habilitado AND s.auto_habilitado
      AND s.auto_desde IS NOT NULL AND c2.pagado_at >= s.auto_desde AND c2.created_at >= s.auto_desde
    ORDER BY c2.pagado_at
    LIMIT greatest(1, least(p_limit, 20))
    FOR UPDATE OF c2 SKIP LOCKED
  )
  RETURNING c.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_facturacion_auto(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_facturacion_auto(int) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_facturacion_auto(
  p_cola_id uuid, p_resultado text, p_error text DEFAULT NULL, p_retryable boolean DEFAULT false, p_factura_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_int int; v_estado text;
BEGIN
  SELECT auto_intentos INTO v_int FROM public.facturacion_cola WHERE id = p_cola_id FOR UPDATE;
  IF p_resultado = 'facturada' THEN v_estado := 'facturada';
  ELSIF p_resultado = 'requiere_datos_fiscales' THEN v_estado := 'requiere_datos_fiscales';
  ELSIF p_resultado = 'requiere_revision_emisor' THEN v_estado := 'requiere_revision_emisor';
  ELSIF p_resultado = 'incierta' THEN v_estado := 'emitiendo';
  ELSIF p_retryable AND coalesce(v_int,0) < 3 THEN v_estado := 'error_reintentable';
  ELSE v_estado := 'error_manual';
  END IF;

  UPDATE public.facturacion_cola SET
    auto_estado = CASE WHEN estado = 'facturada' THEN 'facturada' ELSE v_estado END,
    auto_lock_at = CASE WHEN v_estado = 'emitiendo' THEN auto_lock_at ELSE NULL END,
    auto_ultimo_error = left(p_error, 1000),
    auto_motivo = CASE WHEN v_estado IN ('facturada') THEN NULL ELSE coalesce(left(p_error, 500), auto_motivo) END,
    auto_proximo_intento_at = CASE WHEN v_estado = 'error_reintentable'
      THEN now() + (interval '15 minutes' * power(4, greatest(coalesce(v_int,1),1) - 1)) ELSE NULL END
  WHERE id = p_cola_id;

  INSERT INTO public.facturacion_auto_log(cola_id, factura_id, evento, detalle)
  VALUES (p_cola_id, p_factura_id, v_estado, jsonb_build_object('resultado', p_resultado, 'error', left(p_error, 1000), 'intento', v_int));
  RETURN v_estado;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_facturacion_auto(uuid,text,text,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_facturacion_auto(uuid,text,text,boolean,uuid) TO service_role;

-- ============================================================
-- Acciones de admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_facturacion_auto_config(p_emisor_id uuid, p_segmento text, p_habilitado boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seg text := public._fact_segmento_norm(p_segmento); v_row public.emisor_segmento_config%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_seg IS NULL THEN RAISE EXCEPTION 'Tipo de cobro inválido'; END IF;
  UPDATE public.emisor_segmento_config SET
    auto_habilitado = p_habilitado,
    auto_desde = CASE WHEN p_habilitado THEN coalesce(CASE WHEN auto_habilitado THEN auto_desde END, now()) ELSE NULL END,
    auto_actualizado_por = auth.uid(), auto_actualizado_at = now()
  WHERE emisor_id = p_emisor_id AND segmento = v_seg
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'El emisor no tiene configurado ese tipo de cobro'; END IF;
  INSERT INTO public.audit_log(user_id, user_email, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), CASE WHEN p_habilitado THEN 'facturacion_auto_activada' ELSE 'facturacion_auto_desactivada' END,
          'emisor_segmento_config', p_emisor_id::text, jsonb_build_object('segmento', v_seg, 'auto_desde', v_row.auto_desde));
  RETURN jsonb_build_object('segmento', v_seg, 'auto_habilitado', v_row.auto_habilitado, 'auto_desde', v_row.auto_desde);
END;
$$;
REVOKE ALL ON FUNCTION public.set_facturacion_auto_config(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_facturacion_auto_config(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_cola_emisor_override(p_cola_id uuid, p_emisor_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old uuid; v_row public.facturacion_cola%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Indicá el motivo del cambio de emisor'; END IF;
  SELECT emisor_resuelto_id INTO v_old FROM public.facturacion_cola WHERE id = p_cola_id AND estado = 'pendiente' AND auto_estado <> 'emitiendo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El cobro no está pendiente o se está emitiendo'; END IF;
  IF p_emisor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emisores_fiscales WHERE id = p_emisor_id AND activo) THEN
    RAISE EXCEPTION 'Emisor inválido o inactivo';
  END IF;
  UPDATE public.facturacion_cola SET emisor_override_id = p_emisor_id, emisor_override_por = auth.uid(),
    emisor_override_at = now(), emisor_override_motivo = trim(p_motivo), auto_reevaluar_at = now(), auto_intentos = 0
  WHERE id = p_cola_id RETURNING * INTO v_row;
  INSERT INTO public.audit_log(user_id, user_email, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), 'facturacion_emisor_corregido', 'facturacion_cola', p_cola_id::text,
          jsonb_build_object('emisor_anterior', v_old, 'emisor_nuevo', p_emisor_id, 'motivo', trim(p_motivo)));
  INSERT INTO public.facturacion_auto_log(cola_id, evento, detalle)
  VALUES (p_cola_id, 'emisor_corregido', jsonb_build_object('de', v_old, 'a', p_emisor_id, 'motivo', trim(p_motivo), 'por', auth.uid()));
  RETURN jsonb_build_object('emisor_resuelto_id', v_row.emisor_resuelto_id, 'auto_estado', v_row.auto_estado, 'auto_motivo', v_row.auto_motivo);
END;
$$;
REVOKE ALL ON FUNCTION public.set_cola_emisor_override(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cola_emisor_override(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reevaluar_facturacion_cola(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE public.facturacion_cola SET auto_reevaluar_at = now(), auto_intentos = 0, auto_proximo_intento_at = NULL
  WHERE id = ANY(p_ids) AND estado = 'pendiente' AND auto_estado NOT IN ('emitiendo','facturada');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.reevaluar_facturacion_cola(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reevaluar_facturacion_cola(uuid[]) TO authenticated;

-- Backfill informativo de los pendientes existentes (quedan manuales: ingreso='rebuild')
UPDATE public.facturacion_cola SET auto_reevaluar_at = now() WHERE estado = 'pendiente';
UPDATE public.facturacion_cola SET auto_estado = estado WHERE estado IN ('facturada','excluida','anulada');