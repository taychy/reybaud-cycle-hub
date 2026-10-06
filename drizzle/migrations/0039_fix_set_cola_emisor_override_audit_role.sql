CREATE OR REPLACE FUNCTION public.set_cola_emisor_override(p_cola_id uuid, p_emisor_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old uuid; v_row public.facturacion_cola%ROWTYPE; v_role text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Indicá el motivo del cambio de emisor'; END IF;
  SELECT emisor_resuelto_id INTO v_old FROM public.facturacion_cola WHERE id = p_cola_id AND estado = 'pendiente' AND auto_estado <> 'emitiendo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El cobro no está pendiente o se está emitiendo'; END IF;
  IF p_emisor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emisores_fiscales WHERE id = p_emisor_id AND activo) THEN
    RAISE EXCEPTION 'Emisor inválido o inactivo';
  END IF;
  UPDATE public.facturacion_cola SET emisor_override_id = p_emisor_id, emisor_override_por = auth.uid(),
    emisor_override_at = now(), emisor_override_motivo = trim(p_motivo), auto_reevaluar_at = now(), auto_intentos = 0
  WHERE id = p_cola_id RETURNING * INTO v_row;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role, 'facturacion_emisor_corregido', 'facturacion_cola', p_cola_id::text,
          jsonb_build_object('emisor_anterior', v_old, 'emisor_nuevo', p_emisor_id, 'motivo', trim(p_motivo)));
  INSERT INTO public.facturacion_auto_log(cola_id, evento, detalle)
  VALUES (p_cola_id, 'emisor_corregido', jsonb_build_object('de', v_old, 'a', p_emisor_id, 'motivo', trim(p_motivo), 'por', auth.uid()));
  RETURN jsonb_build_object('emisor_resuelto_id', v_row.emisor_resuelto_id, 'auto_estado', v_row.auto_estado, 'auto_motivo', v_row.auto_motivo);
END;
$$;
REVOKE ALL ON FUNCTION public.set_cola_emisor_override(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cola_emisor_override(uuid,uuid,text) TO authenticated;