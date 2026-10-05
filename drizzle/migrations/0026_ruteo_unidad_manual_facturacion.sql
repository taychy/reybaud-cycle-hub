-- ============================================================
-- Ruteo manual de cobros por unidad de negocio (switch admin)
-- Fuente de verdad del destino de NUEVOS cobros y su emisor fiscal.
-- Sin vigencias automáticas: permanece hasta que un admin lo cambie.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.unidad_routing (
  unidad public.unidad_negocio_mp PRIMARY KEY,
  activa boolean NOT NULL DEFAULT false,
  cuenta_mp_id uuid REFERENCES public.cuentas_mp(id) ON DELETE SET NULL,
  emisor_fiscal_id uuid REFERENCES public.emisores_fiscales(id) ON DELETE SET NULL,
  cambiado_por uuid,
  cambiado_por_email text,
  cambiado_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.unidad_routing TO authenticated;
GRANT ALL ON public.unidad_routing TO service_role;
ALTER TABLE public.unidad_routing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen ruteo por unidad" ON public.unidad_routing
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Ruta activa de una unidad (lectura pura)
CREATE OR REPLACE FUNCTION public.ruta_unidad_activa(p_unidad text)
RETURNS public.unidad_routing
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM public.unidad_routing r
  WHERE r.unidad::text = lower(trim(p_unidad)) AND r.activa
    AND r.cuenta_mp_id IS NOT NULL AND r.emisor_fiscal_id IS NOT NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ruta_unidad_activa(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ruta_unidad_activa(text) TO service_role;

-- Cambio manual del ruteo (solo admin/super_admin, con auditoría)
CREATE OR REPLACE FUNCTION public.set_unidad_routing(p_unidad text, p_activa boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_unidad text := lower(trim(coalesce(p_unidad,'')));
  v_prev public.unidad_routing%ROWTYPE;
  v_cuenta uuid; v_emisor uuid;
  v_role text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_unidad NOT IN ('suscripcion_escuela','viaje_camp','tienda','preventa','evento') THEN
    RAISE EXCEPTION 'Unidad de negocio no ruteable: %', v_unidad;
  END IF;
  SELECT * INTO v_prev FROM public.unidad_routing WHERE unidad::text = v_unidad;

  IF p_activa THEN
    SELECT r.cuenta_mp_id, r.emisor_fiscal_id INTO v_cuenta, v_emisor
    FROM public.cuenta_mp_routing r
    WHERE r.unidad_negocio::text = v_unidad AND r.activa
      AND r.cuenta_mp_id IS NOT NULL AND r.emisor_fiscal_id IS NOT NULL
    ORDER BY r.created_at NULLS LAST LIMIT 1;
    IF v_cuenta IS NULL OR v_emisor IS NULL THEN
      RAISE EXCEPTION 'La unidad % no tiene una ruta alternativa configurada', v_unidad;
    END IF;
  END IF;

  INSERT INTO public.unidad_routing (unidad, activa, cuenta_mp_id, emisor_fiscal_id, cambiado_por, cambiado_por_email, cambiado_at)
  VALUES (v_unidad::public.unidad_negocio_mp, p_activa,
          CASE WHEN p_activa THEN v_cuenta ELSE NULL END,
          CASE WHEN p_activa THEN v_emisor ELSE NULL END,
          auth.uid(), auth.email(), now())
  ON CONFLICT (unidad) DO UPDATE SET
    activa = EXCLUDED.activa, cuenta_mp_id = EXCLUDED.cuenta_mp_id,
    emisor_fiscal_id = EXCLUDED.emisor_fiscal_id,
    cambiado_por = EXCLUDED.cambiado_por, cambiado_por_email = EXCLUDED.cambiado_por_email,
    cambiado_at = EXCLUDED.cambiado_at;

  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role, 'ruteo_unidad_cambiado', 'unidad_routing', v_unidad,
    jsonb_build_object(
      'unidad', v_unidad,
      'ruta_anterior', CASE WHEN coalesce(v_prev.activa,false) THEN jsonb_build_object('cuenta_mp_id', v_prev.cuenta_mp_id, 'emisor_fiscal_id', v_prev.emisor_fiscal_id) ELSE NULL END,
      'ruta_nueva', CASE WHEN p_activa THEN jsonb_build_object('cuenta_mp_id', v_cuenta, 'emisor_fiscal_id', v_emisor) ELSE NULL END,
      'motivo', left(coalesce(p_motivo,''), 500)));

  RETURN jsonb_build_object('unidad', v_unidad, 'activa', p_activa,
    'cuenta_mp_id', CASE WHEN p_activa THEN v_cuenta END,
    'emisor_fiscal_id', CASE WHEN p_activa THEN v_emisor END);
END;
$$;
REVOKE ALL ON FUNCTION public.set_unidad_routing(text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_unidad_routing(text,boolean,text) TO authenticated;

-- Interruptor general por emisor (admin/super_admin, con auditoría)
CREATE OR REPLACE FUNCTION public.set_facturacion_automatica_emisor(p_emisor_id uuid, p_activa boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_nombre text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT nombre_fiscal INTO v_nombre FROM public.emisores_fiscales WHERE id = p_emisor_id AND activo;
  IF v_nombre IS NULL THEN RAISE EXCEPTION 'Emisor inexistente o inactivo'; END IF;
  UPDATE public.emisores_fiscales SET facturacion_automatica = p_activa WHERE id = p_emisor_id;
  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role,
          CASE WHEN p_activa THEN 'facturacion_automatica_emisor_activada' ELSE 'facturacion_automatica_emisor_desactivada' END,
          'emisores_fiscales', p_emisor_id::text, jsonb_build_object('emisor', v_nombre));
  RETURN jsonb_build_object('emisor_id', p_emisor_id, 'facturacion_automatica', p_activa);
END;
$$;
REVOKE ALL ON FUNCTION public.set_facturacion_automatica_emisor(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_facturacion_automatica_emisor(uuid,boolean) TO authenticated;

-- Auditoría de set_facturacion_auto_config: faltaba user_role (NOT NULL)
CREATE OR REPLACE FUNCTION public.set_facturacion_auto_config(p_emisor_id uuid, p_segmento text, p_habilitado boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seg text := public._fact_segmento_norm(p_segmento); v_row public.emisor_segmento_config%ROWTYPE; v_role text;
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
  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role,
          CASE WHEN p_habilitado THEN 'facturacion_auto_activada' ELSE 'facturacion_auto_desactivada' END,
          'emisor_segmento_config', p_emisor_id::text, jsonb_build_object('segmento', v_seg, 'auto_desde', v_row.auto_desde));
  RETURN jsonb_build_object('segmento', v_seg, 'auto_habilitado', v_row.auto_habilitado, 'auto_desde', v_row.auto_desde);
END;
$$;
REVOKE ALL ON FUNCTION public.set_facturacion_auto_config(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_facturacion_auto_config(uuid,text,boolean) TO authenticated;

-- Resolución de emisor: el switch manual de la unidad manda sobre la configuración base
CREATE OR REPLACE FUNCTION public.resolver_emisor_facturacion(p_segmento text, p_metodo_pago text, p_cuenta_mp_id uuid, p_emisor_explicito uuid DEFAULT NULL::uuid, p_override uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seg text := public._fact_segmento_norm(p_segmento);
  v_metodo text := lower(trim(coalesce(p_metodo_pago,'')));
  v_emisor uuid; v_origen text; v_cuenta uuid; v_n int;
  v_medio public.facturacion_medio_cuenta%ROWTYPE; v_has_medio boolean := false;
  v_ruta public.unidad_routing%ROWTYPE;
BEGIN
  IF p_override IS NOT NULL THEN
    v_emisor := p_override; v_origen := 'override_manual';
  ELSIF p_emisor_explicito IS NOT NULL THEN
    v_emisor := p_emisor_explicito; v_origen := 'emisor_del_flujo';
  ELSE
    SELECT * INTO v_ruta FROM public.unidad_routing r
    WHERE r.unidad::text = ANY(public._fact_unidades(v_seg)) AND r.activa
      AND r.cuenta_mp_id IS NOT NULL AND r.emisor_fiscal_id IS NOT NULL
    LIMIT 1;
    IF FOUND THEN
      v_emisor := v_ruta.emisor_fiscal_id; v_origen := 'ruteo_manual_unidad'; v_cuenta := v_ruta.cuenta_mp_id;
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

-- Evaluación: no pisar la cuenta snapshot del cobro si la referencia no la tiene
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
  v_rango int; v_cuenta_ref uuid;
BEGIN
  IF r.auto_estado IN ('emitiendo','facturada') THEN RETURN r; END IF;
  IF r.estado IN ('facturada','excluida','anulada') THEN r.auto_estado := r.estado; RETURN r; END IF;

  v_mes := date_trunc('month', (r.pagado_at AT TIME ZONE v_tz))::date;

  IF r.referencia_tipo = 'suscripcion' THEN
    SELECT s.cuenta_mp_id, s.fecha_inicio, s.fecha_fin INTO v_cuenta_ref, v_desde, v_hasta
    FROM public.suscripciones s WHERE s.id = r.referencia_id;
  ELSIF r.referencia_tipo IN ('reservation_payment','evento') THEN
    SELECT rp.cuenta_mp_id, e.date, coalesce(e.end_date, e.date) INTO v_cuenta_ref, v_desde, v_hasta
    FROM public.reservation_payments rp
    LEFT JOIN public.event_reservations er ON er.id = rp.reservation_id
    LEFT JOIN public.events e ON e.id = er.event_id
    WHERE rp.id = r.referencia_id;
  ELSIF r.referencia_tipo = 'pedido_tienda' THEN
    SELECT o.cuenta_mp_id, o.tienda_emisor_id INTO v_cuenta_ref, v_emisor_expl
    FROM public.store_orders o WHERE o.id = r.referencia_id;
  ELSIF r.referencia_tipo = 'pedido' THEN
    SELECT p.cuenta_mp_id INTO v_cuenta_ref FROM public.store_preorders p WHERE p.id = r.referencia_id;
  END IF;
  IF r.cuenta_mp_id IS NULL THEN r.cuenta_mp_id := v_cuenta_ref; END IF;

  r.servicio_desde := coalesce(v_desde, v_mes);
  r.servicio_hasta := coalesce(v_hasta, (v_mes + interval '1 month - 1 day')::date);
  r.fecha_comprobante := (r.pagado_at AT TIME ZONE v_tz)::date;

  IF upper(coalesce(r.moneda,'ARS')) <> 'ARS' THEN
    r.auto_estado := 'error_manual';
    r.auto_motivo := 'moneda_no_soportada_automaticamente: solo ARS en esta fase';
    RETURN r;
  END IF;

  v_doc_raw := nullif(regexp_replace(coalesce(r.cliente_cuit,''), '[^0-9]', '', 'g'), '');
  IF v_doc_raw IS NULL THEN
    r.auto_estado := 'requiere_datos_fiscales';
    r.auto_motivo := 'Falta DNI/CUIT del cliente';
    RETURN r;
  END IF;
  IF length(v_doc_raw) = 11 THEN v_tipo_doc := 'cuit';
  ELSIF length(v_doc_raw) BETWEEN 7 AND 8 THEN v_tipo_doc := 'dni';
  ELSE
    r.auto_estado := 'requiere_datos_fiscales';
    r.auto_motivo := format('Documento inválido (%s dígitos): se espera DNI de 7-8 u CUIT de 11', length(v_doc_raw));
    RETURN r;
  END IF;
  r.cliente_cuit := v_doc_raw;

  v_res := public.resolver_emisor_facturacion(v_seg, r.metodo_pago, r.cuenta_mp_id, v_emisor_expl, r.emisor_override_id);
  r.emisor_resuelto_id := (v_res->>'emisor_id')::uuid;
  r.cuenta_mp_id := coalesce((v_res->>'cuenta_mp_id')::uuid, r.cuenta_mp_id);
  IF r.emisor_resuelto_id IS NULL THEN
    r.auto_estado := 'requiere_revision_emisor';
    r.auto_motivo := coalesce(v_res->>'motivo', 'No se pudo resolver el emisor');
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

-- Cola de mensualidades: solo cobros MP aprobados (pagado real), con snapshot de la ruta vigente
CREATE OR REPLACE FUNCTION public.enqueue_suscripcion_facturacion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pago text; v_monto numeric; v_plan_nombre text; v_plan_precio numeric; v_plan_moneda text;
  v_nombre text; v_doc text;
  v_ruta public.unidad_routing%ROWTYPE; v_cuenta uuid;
BEGIN
  -- Solo cobros confirmados por Mercado Pago: una mensualidad cargada a mano sin
  -- confirmación de pago no entra a la cola automática (pagado_at es la fuente de verdad).
  IF NEW.mp_status = 'approved' AND NEW.mp_payment_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.mp_status IS DISTINCT FROM 'approved' OR OLD.mp_payment_id IS DISTINCT FROM NEW.mp_payment_id) THEN
    v_pago := NEW.mp_payment_id;
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    SELECT p.nombre, p.precio, p.moneda INTO v_plan_nombre, v_plan_precio, v_plan_moneda FROM public.planes p WHERE p.id = NEW.plan_id;
    v_monto := COALESCE(NEW.precio_final, NEW.precio_base, v_plan_precio, 0);
    IF v_monto <= 0 THEN RETURN NEW; END IF;
    SELECT COALESCE(NULLIF(TRIM(a.nombre_fiscal),''), NULLIF(TRIM(CONCAT(a.nombre,' ',a.apellido)),''), '—'), a.documento
      INTO v_nombre, v_doc FROM public.alumnos a WHERE a.id = NEW.alumno_id;

    -- Snapshot de la ruta vigente: si la unidad está ruteada manualmente, el cobro
    -- queda asociado a esa cuenta receptora aunque el registro del pago no la tenga.
    SELECT * INTO v_ruta FROM public.unidad_routing r
    WHERE r.unidad = 'suscripcion_escuela' AND r.activa AND r.cuenta_mp_id IS NOT NULL
    LIMIT 1;
    v_cuenta := coalesce(NEW.cuenta_mp_id, CASE WHEN v_ruta.activa THEN v_ruta.cuenta_mp_id END);

    INSERT INTO public.facturacion_cola (
      source, pago_id, referencia_tipo, referencia_id, alumno_id, cliente_nombre, cliente_cuit, concepto,
      monto, moneda, segmento, metodo_pago, origen_registro, pagado_at, periodo_pago, periodo_operativo, ingreso, cuenta_mp_id
    ) VALUES (
      'suscripcion', v_pago, 'suscripcion', NEW.id, NEW.alumno_id, COALESCE(v_nombre,'—'), v_doc,
      CONCAT('Suscripción ', COALESCE(v_plan_nombre,'')), v_monto, COALESCE(v_plan_moneda,'ARS'), 'escuela',
      COALESCE(NEW.metodo_pago, 'mercadopago'), NEW.origen_registro, now(),
      date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date,
      COALESCE(date_trunc('month', NEW.fecha_inicio)::date, date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date),
      'automatico', v_cuenta
    )
    ON CONFLICT (referencia_tipo, referencia_id, pago_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'facturacion_cola suscripcion %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Re-evaluar filas pendientes cuando cambia el ruteo de una unidad
CREATE OR REPLACE FUNCTION public.tg_unidad_routing_reeval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.activa IS DISTINCT FROM OLD.activa
     OR NEW.cuenta_mp_id IS DISTINCT FROM OLD.cuenta_mp_id
     OR NEW.emisor_fiscal_id IS DISTINCT FROM OLD.emisor_fiscal_id THEN
    UPDATE public.facturacion_cola c
    SET auto_estado = NULL, auto_lock_at = NULL, auto_proximo_intento_at = NULL, auto_intentos = 0
    WHERE c.estado = 'pendiente'
      AND c.auto_estado IN ('requiere_revision_emisor','manual')
      AND public._fact_unidades(public._fact_segmento_norm(c.segmento)) @> ARRAY[NEW.unidad::text];
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_unidad_routing_reeval ON public.unidad_routing;
CREATE TRIGGER trg_unidad_routing_reeval
  AFTER INSERT OR UPDATE ON public.unidad_routing
  FOR EACH ROW EXECUTE FUNCTION public.tg_unidad_routing_reeval();