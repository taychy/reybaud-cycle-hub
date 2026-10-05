-- Escuela agrupa suscripciones, servicios personalizados/asesorías y turnera
CREATE OR REPLACE FUNCTION public._fact_unidades(p_seg text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_seg
    WHEN 'escuela' THEN ARRAY['suscripcion_escuela','personalizado','turnera']
    WHEN 'viajes' THEN ARRAY['viaje_camp','evento']
    WHEN 'tienda' THEN ARRAY['tienda','preventa']
    ELSE ARRAY[]::text[] END
$$;

-- Clave de grupo para el override: una fila por Escuela / Viajes / Tienda
CREATE OR REPLACE FUNCTION public._ruteo_grupo(p_unidad text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(trim(coalesce(p_unidad,'')))
    WHEN 'suscripcion_escuela' THEN 'suscripcion_escuela' WHEN 'personalizado' THEN 'suscripcion_escuela'
    WHEN 'turnera' THEN 'suscripcion_escuela' WHEN 'escuela' THEN 'suscripcion_escuela'
    WHEN 'viaje_camp' THEN 'viaje_camp' WHEN 'evento' THEN 'viaje_camp' WHEN 'viajes' THEN 'viaje_camp'
    WHEN 'tienda' THEN 'tienda' WHEN 'preventa' THEN 'tienda'
    ELSE NULL END
$$;

-- Override vigente (Josilene) para la unidad de un cobro nuevo
CREATE OR REPLACE FUNCTION public.ruta_unidad_activa(p_unidad text)
RETURNS public.unidad_routing
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.* FROM public.unidad_routing r
  WHERE r.unidad::text = public._ruteo_grupo(p_unidad) AND r.activa
    AND r.cuenta_mp_id IS NOT NULL AND r.emisor_fiscal_id IS NOT NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ruta_unidad_activa(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ruta_unidad_activa(text) TO service_role;

-- Activar/desactivar override Josilene: cuenta y emisor cambian juntos
CREATE OR REPLACE FUNCTION public.set_unidad_routing(p_unidad text, p_activa boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_unidad text := public._ruteo_grupo(p_unidad);
  v_seg text;
  v_prev public.unidad_routing%ROWTYPE;
  v_cuenta uuid; v_emisor uuid; v_role text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_unidad IS NULL THEN RAISE EXCEPTION 'Unidad de negocio no ruteable: %', p_unidad; END IF;
  v_seg := CASE v_unidad WHEN 'suscripcion_escuela' THEN 'escuela' WHEN 'viaje_camp' THEN 'viajes' ELSE 'tienda' END;
  SELECT * INTO v_prev FROM public.unidad_routing WHERE unidad::text = v_unidad;

  IF p_activa THEN
    SELECT c.id, c.emisor_fiscal_default_id INTO v_cuenta, v_emisor
    FROM public.cuentas_mp c
    WHERE c.slug = 'josilene_do_nascimento' AND c.activa;
    IF v_cuenta IS NULL OR v_emisor IS NULL THEN
      RAISE EXCEPTION 'La cuenta MP de Josilene no está activa o no tiene emisor fiscal';
    END IF;
    -- Josilene queda habilitada como emisora del tipo de cobro (la emisión automática no se toca)
    UPDATE public.emisor_segmento_config SET habilitado = true
    WHERE emisor_id = v_emisor AND segmento = v_seg AND NOT habilitado;
  END IF;

  INSERT INTO public.unidad_routing (unidad, activa, cuenta_mp_id, emisor_fiscal_id, cambiado_por, cambiado_por_email, cambiado_at)
  VALUES (v_unidad::public.unidad_negocio_mp, p_activa,
          CASE WHEN p_activa THEN v_cuenta END, CASE WHEN p_activa THEN v_emisor END,
          auth.uid(), auth.email(), now())
  ON CONFLICT (unidad) DO UPDATE SET
    activa = EXCLUDED.activa, cuenta_mp_id = EXCLUDED.cuenta_mp_id,
    emisor_fiscal_id = EXCLUDED.emisor_fiscal_id,
    cambiado_por = EXCLUDED.cambiado_por, cambiado_por_email = EXCLUDED.cambiado_por_email,
    cambiado_at = EXCLUDED.cambiado_at;

  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role, 'ruteo_unidad_cambiado', 'unidad_routing', v_unidad,
    jsonb_build_object('unidad', v_unidad,
      'ruta_anterior', CASE WHEN coalesce(v_prev.activa,false) THEN jsonb_build_object('tipo','override_josilene','cuenta_mp_id', v_prev.cuenta_mp_id, 'emisor_fiscal_id', v_prev.emisor_fiscal_id) ELSE jsonb_build_object('tipo','normal') END,
      'ruta_nueva', CASE WHEN p_activa THEN jsonb_build_object('tipo','override_josilene','cuenta_mp_id', v_cuenta, 'emisor_fiscal_id', v_emisor) ELSE jsonb_build_object('tipo','normal') END,
      'motivo', left(coalesce(p_motivo,''), 500)));

  RETURN jsonb_build_object('unidad', v_unidad, 'activa', p_activa, 'cuenta_mp_id', v_cuenta, 'emisor_fiscal_id', v_emisor);
END;
$$;
REVOKE ALL ON FUNCTION public.set_unidad_routing(text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_unidad_routing(text,boolean,text) TO authenticated;

-- Emisor = el de la cuenta que REALMENTE recibió el cobro. Sin cuenta, sin default ni inferencias.
CREATE OR REPLACE FUNCTION public.resolver_emisor_facturacion(p_segmento text, p_metodo_pago text, p_cuenta_mp_id uuid, p_emisor_explicito uuid DEFAULT NULL::uuid, p_override uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seg text := public._fact_segmento_norm(p_segmento);
  v_metodo text := lower(trim(coalesce(p_metodo_pago,'')));
  v_cuenta uuid := p_cuenta_mp_id; v_emisor uuid; v_origen text;
  v_c public.cuentas_mp%ROWTYPE; v_normal boolean; v_medio_cuenta uuid;
BEGIN
  IF p_override IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.emisores_fiscales WHERE id = p_override AND activo) THEN
      RETURN jsonb_build_object('emisor_id', NULL, 'origen', 'override_manual', 'cuenta_mp_id', v_cuenta, 'motivo', 'El emisor elegido no existe o está inactivo');
    END IF;
    RETURN jsonb_build_object('emisor_id', p_override, 'origen', 'override_manual', 'cuenta_mp_id', v_cuenta, 'motivo', NULL);
  END IF;

  IF v_cuenta IS NULL THEN
    SELECT m.cuenta_mp_id INTO v_medio_cuenta FROM public.facturacion_medio_cuenta m WHERE m.metodo_pago = v_metodo;
    v_cuenta := v_medio_cuenta;
  END IF;
  IF v_cuenta IS NULL THEN
    RETURN jsonb_build_object('emisor_id', NULL, 'origen', NULL, 'cuenta_mp_id', NULL,
      'motivo', format('requiere_revision_emisor: no se puede determinar la cuenta receptora real (medio: %s)', coalesce(nullif(v_metodo,''),'desconocido')));
  END IF;

  SELECT * INTO v_c FROM public.cuentas_mp WHERE id = v_cuenta;
  v_emisor := v_c.emisor_fiscal_default_id;
  IF v_emisor IS NULL THEN
    RETURN jsonb_build_object('emisor_id', NULL, 'origen', NULL, 'cuenta_mp_id', v_cuenta,
      'motivo', 'requiere_revision_emisor: la cuenta receptora no tiene emisor fiscal asociado');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.cuenta_mp_routing r
    WHERE r.cuenta_mp_id = v_cuenta AND r.activa AND r.unidad_negocio::text = ANY(public._fact_unidades(v_seg)))
  INTO v_normal;
  IF v_normal THEN v_origen := 'ruta_normal';
  ELSIF v_c.slug = 'josilene_do_nascimento' THEN v_origen := 'override_josilene';
  ELSE
    RETURN jsonb_build_object('emisor_id', NULL, 'origen', NULL, 'cuenta_mp_id', v_cuenta,
      'motivo', format('requiere_revision_emisor: la cuenta %s no corresponde a %s', v_c.nombre, coalesce(v_seg,'este tipo de cobro')));
  END IF;

  IF p_emisor_explicito IS NOT NULL AND p_emisor_explicito <> v_emisor THEN
    RETURN jsonb_build_object('emisor_id', NULL, 'origen', v_origen, 'cuenta_mp_id', v_cuenta,
      'motivo', 'requiere_revision_emisor: el emisor indicado no coincide con la cuenta que recibió el cobro');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.emisores_fiscales WHERE id = v_emisor AND activo) THEN
    RETURN jsonb_build_object('emisor_id', NULL, 'origen', v_origen, 'cuenta_mp_id', v_cuenta, 'motivo', 'El emisor resuelto no existe o está inactivo');
  END IF;
  RETURN jsonb_build_object('emisor_id', v_emisor, 'origen', v_origen, 'cuenta_mp_id', v_cuenta, 'motivo', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_emisor_facturacion(text,text,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_emisor_facturacion(text,text,uuid,uuid,uuid) TO authenticated, service_role;