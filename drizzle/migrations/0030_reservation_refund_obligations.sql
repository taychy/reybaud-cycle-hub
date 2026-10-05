CREATE TABLE public.reservation_refund_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  estado text NOT NULL CHECK (estado IN ('no_corresponde','pendiente','parcial','completada','revision_manual')),
  monto_bruto numeric NOT NULL DEFAULT 0,
  monto_retenido numeric NOT NULL DEFAULT 0,
  monto_sugerido numeric NOT NULL DEFAULT 0 CHECK (monto_sugerido >= 0),
  monto_devuelto numeric NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  regla_aplicada text,
  fuente text,
  politica_texto text,
  ajustado_manual boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reservation_refund_obligations TO authenticated;
GRANT ALL ON public.reservation_refund_obligations TO service_role;
ALTER TABLE public.reservation_refund_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leen obligaciones de devolución" ON public.reservation_refund_obligations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public._refund_estado(p_sugerido numeric, p_devuelto numeric, p_actual text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_actual = 'revision_manual' AND coalesce(p_devuelto,0) <= 0 THEN 'revision_manual'
    WHEN coalesce(p_sugerido,0) <= 0 THEN 'no_corresponde'
    WHEN p_devuelto + 0.01 >= p_sugerido THEN 'completada'
    WHEN p_devuelto > 0 THEN 'parcial'
    ELSE 'pendiente' END
$$;

-- Registrar la obligación al confirmar la cancelación (no crea devoluciones ni gastos)
CREATE OR REPLACE FUNCTION public.registrar_obligacion_devolucion(
  p_reservation_id uuid, p_estado text, p_retenido numeric, p_sugerido numeric,
  p_regla text, p_fuente text, p_politica_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res public.event_reservations%ROWTYPE; v_bruto numeric; v_dev numeric; v_sug numeric;
  v_estado text; v_row public.reservation_refund_obligations%ROWTYPE; v_role text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO v_res FROM public.event_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva inexistente'; END IF;
  SELECT * INTO v_row FROM public.reservation_refund_obligations WHERE reservation_id = p_reservation_id;
  IF FOUND THEN RETURN jsonb_build_object('status','ya_existia','estado', v_row.estado, 'monto_sugerido', v_row.monto_sugerido); END IF;
  IF p_estado NOT IN ('no_corresponde','pendiente','revision_manual') THEN RAISE EXCEPTION 'Estado inicial inválido'; END IF;

  SELECT coalesce(sum(coalesce(equivalent_amount_event_currency, amount)),0) INTO v_bruto
  FROM public.reservation_payments WHERE reservation_id = p_reservation_id AND status = 'validado';
  SELECT coalesce(sum(monto),0) INTO v_dev FROM public.devoluciones WHERE reservation_id = p_reservation_id;
  v_sug := least(greatest(coalesce(p_sugerido,0),0), v_bruto);
  v_estado := CASE WHEN v_bruto <= 0 THEN 'no_corresponde'
                   WHEN p_estado = 'revision_manual' THEN 'revision_manual'
                   ELSE public._refund_estado(v_sug, v_dev, p_estado) END;

  INSERT INTO public.reservation_refund_obligations (reservation_id, estado, monto_bruto, monto_retenido, monto_sugerido, monto_devuelto, moneda, regla_aplicada, fuente, politica_texto, created_by)
  VALUES (p_reservation_id, v_estado, v_bruto, CASE WHEN v_estado='revision_manual' THEN 0 ELSE v_bruto - v_sug END,
          CASE WHEN v_estado='revision_manual' THEN 0 ELSE v_sug END, v_dev,
          coalesce(v_res.currency_snapshot, v_res.moneda, 'ARS'), left(p_regla, 1000), p_fuente, left(p_politica_texto, 5000), auth.uid())
  RETURNING * INTO v_row;

  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role, 'devolucion_sugerida_calculada', 'event_reservations', p_reservation_id::text,
    jsonb_build_object('estado', v_row.estado, 'bruto', v_bruto, 'retenido', v_row.monto_retenido, 'sugerido', v_row.monto_sugerido, 'regla', p_regla, 'fuente', p_fuente));
  RETURN jsonb_build_object('status','creada','estado', v_row.estado, 'monto_sugerido', v_row.monto_sugerido);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_obligacion_devolucion(uuid,text,numeric,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_obligacion_devolucion(uuid,text,numeric,numeric,text,text,text) TO authenticated;

-- Ajuste manual del monto sugerido (p. ej. tras revisión manual)
CREATE OR REPLACE FUNCTION public.ajustar_obligacion_devolucion(p_reservation_id uuid, p_monto numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.reservation_refund_obligations%ROWTYPE; v_new numeric; v_estado text; v_role text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Indicá el motivo del ajuste'; END IF;
  SELECT * INTO v_row FROM public.reservation_refund_obligations WHERE reservation_id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La reserva no tiene devolución registrada'; END IF;
  IF p_monto IS NULL OR p_monto < 0 OR p_monto > v_row.monto_bruto THEN
    RAISE EXCEPTION 'El monto debe estar entre 0 y lo pagado (%)', v_row.monto_bruto;
  END IF;
  v_new := round(p_monto, 2);
  v_estado := public._refund_estado(v_new, v_row.monto_devuelto, 'pendiente');
  UPDATE public.reservation_refund_obligations
  SET monto_sugerido = v_new, monto_retenido = monto_bruto - v_new, estado = v_estado, ajustado_manual = true, updated_at = now()
  WHERE id = v_row.id;
  v_role := CASE WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END;
  INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), auth.email(), v_role, 'devolucion_sugerida_ajustada', 'event_reservations', p_reservation_id::text,
    jsonb_build_object('anterior', v_row.monto_sugerido, 'nuevo', v_new, 'estado_anterior', v_row.estado, 'estado_nuevo', v_estado, 'motivo', left(p_motivo,500)));
  RETURN jsonb_build_object('estado', v_estado, 'monto_sugerido', v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.ajustar_obligacion_devolucion(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_obligacion_devolucion(uuid,numeric,text) TO authenticated;

-- Devolución real registrada/vinculada → descuenta del pendiente
CREATE OR REPLACE FUNCTION public.tg_devoluciones_sync_obligacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; v_id uuid; v_row public.reservation_refund_obligations%ROWTYPE; v_dev numeric; v_estado text;
BEGIN
  v_ids := array_remove(ARRAY[
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.reservation_id END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.reservation_id END], NULL);
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO v_row FROM public.reservation_refund_obligations WHERE reservation_id = v_id FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    SELECT coalesce(sum(monto),0) INTO v_dev FROM public.devoluciones WHERE reservation_id = v_id;
    v_estado := public._refund_estado(v_row.monto_sugerido, v_dev, v_row.estado);
    UPDATE public.reservation_refund_obligations SET monto_devuelto = v_dev, estado = v_estado, updated_at = now() WHERE id = v_row.id;
    INSERT INTO public.audit_log(user_id, user_email, user_role, action, entity_type, entity_id, details)
    VALUES (auth.uid(), coalesce(auth.email(),'sistema'),
      CASE WHEN auth.uid() IS NULL THEN 'system' WHEN public.is_super_admin(auth.uid()) THEN 'super_admin' ELSE 'admin' END,
      'devolucion_real_vinculada', 'event_reservations', v_id::text,
      jsonb_build_object('devuelto_total', v_dev, 'sugerido', v_row.monto_sugerido, 'estado_anterior', v_row.estado, 'estado_nuevo', v_estado,
        'devolucion_id', CASE WHEN TG_OP <> 'DELETE' THEN NEW.id ELSE OLD.id END, 'operacion', TG_OP));
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_devoluciones_sync_obligacion
AFTER INSERT OR UPDATE OF monto, reservation_id OR DELETE ON public.devoluciones
FOR EACH ROW EXECUTE FUNCTION public.tg_devoluciones_sync_obligacion();