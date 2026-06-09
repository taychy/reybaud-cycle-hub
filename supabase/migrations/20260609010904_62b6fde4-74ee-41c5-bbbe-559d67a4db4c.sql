
-- 1) Extender origen check para admitir 'admin_directa'
ALTER TABLE public.bajas_solicitudes DROP CONSTRAINT IF EXISTS bajas_solicitudes_origen_check;
ALTER TABLE public.bajas_solicitudes ADD CONSTRAINT bajas_solicitudes_origen_check
  CHECK (origen = ANY (ARRAY['alumno'::text, 'admin'::text, 'admin_directa'::text]));

-- 2) Tabla devoluciones
CREATE TABLE IF NOT EXISTS public.devoluciones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  suscripcion_id uuid REFERENCES public.suscripciones(id) ON DELETE SET NULL,
  monto numeric NOT NULL CHECK (monto > 0),
  moneda text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD','EUR')),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  metodo text NOT NULL DEFAULT 'transferencia',
  referencia text,
  motivo text NOT NULL,
  notas text,
  ajuste_id uuid REFERENCES public.cuenta_ajustes(id) ON DELETE SET NULL,
  baja_solicitud_id uuid REFERENCES public.bajas_solicitudes(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_alumno ON public.devoluciones(alumno_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_devoluciones_fecha ON public.devoluciones(fecha DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devoluciones TO authenticated;
GRANT ALL ON public.devoluciones TO service_role;

ALTER TABLE public.devoluciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven devoluciones" ON public.devoluciones FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins crean devoluciones" ON public.devoluciones FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins editan devoluciones" ON public.devoluciones FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins borran devoluciones" ON public.devoluciones FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_devoluciones_updated_at
  BEFORE UPDATE ON public.devoluciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RPC registrar_devolucion
CREATE OR REPLACE FUNCTION public.registrar_devolucion(
  p_alumno_id uuid,
  p_monto numeric,
  p_moneda text DEFAULT 'ARS',
  p_motivo text DEFAULT 'Devolución',
  p_metodo text DEFAULT 'transferencia',
  p_fecha date DEFAULT CURRENT_DATE,
  p_referencia text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_suscripcion_id uuid DEFAULT NULL,
  p_baja_solicitud_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_devolucion_id uuid;
  v_ajuste_id uuid;
  v_concepto text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admin puede registrar devoluciones';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  v_concepto := 'Devolución: ' || COALESCE(p_motivo, 'sin detalle');

  -- Crédito espejo en cuenta corriente (compatibilidad con esperado/cobrado)
  INSERT INTO public.cuenta_ajustes (alumno_id, tipo, concepto, monto, moneda, fecha, notas, created_by)
  VALUES (p_alumno_id, 'credito', v_concepto, p_monto, COALESCE(p_moneda,'ARS'), COALESCE(p_fecha, CURRENT_DATE),
          COALESCE(p_notas, '') || CASE WHEN p_referencia IS NOT NULL THEN ' [ref: ' || p_referencia || ']' ELSE '' END,
          auth.uid())
  RETURNING id INTO v_ajuste_id;

  INSERT INTO public.devoluciones (
    alumno_id, suscripcion_id, monto, moneda, fecha, metodo, referencia,
    motivo, notas, ajuste_id, baja_solicitud_id, created_by
  ) VALUES (
    p_alumno_id, p_suscripcion_id, p_monto, COALESCE(p_moneda,'ARS'), COALESCE(p_fecha, CURRENT_DATE),
    COALESCE(p_metodo,'transferencia'), p_referencia,
    COALESCE(p_motivo,'Devolución'), p_notas, v_ajuste_id, p_baja_solicitud_id, auth.uid()
  ) RETURNING id INTO v_devolucion_id;

  RETURN v_devolucion_id;
END;
$$;

-- 4) RPC dar_baja_directa: crea solicitud admin_directa y la confirma
CREATE OR REPLACE FUNCTION public.dar_baja_directa(
  p_alumno_id uuid,
  p_motivo text,
  p_motivo_otro_detalle text DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_email_notificar boolean DEFAULT true
) RETURNS TABLE(solicitud_id uuid, alumno_id uuid, mp_preapproval_ids text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitud_id uuid;
  v_existing_id uuid;
  v_snap jsonb;
  v_result record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo admin puede dar baja directa';
  END IF;

  -- Si ya hay solicitud abierta, la reutilizamos
  SELECT id INTO v_existing_id
  FROM public.bajas_solicitudes
  WHERE alumno_id = p_alumno_id AND estado = 'solicitada'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_solicitud_id := v_existing_id;
  ELSE
    -- snapshot mínimo: planes activos
    SELECT jsonb_build_object(
      'planes_activos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id,
          'plan_nombre', pl.nombre,
          'estado', s.estado,
          'fecha_fin', s.fecha_fin,
          'auto_renovacion', s.auto_renovacion
        ))
        FROM public.suscripciones s
        LEFT JOIN public.planes pl ON pl.id = s.plan_id
        WHERE s.alumno_id = p_alumno_id
          AND s.cancelada_at IS NULL
          AND s.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa')
      ), '[]'::jsonb),
      'origen_admin_directa', true
    ) INTO v_snap;

    INSERT INTO public.bajas_solicitudes (
      alumno_id, origen, solicitada_por_user_id, motivo, motivo_otro_detalle, comentario, estado, snapshot
    ) VALUES (
      p_alumno_id, 'admin_directa', auth.uid(),
      COALESCE(p_motivo,'otro'), p_motivo_otro_detalle, p_comentario,
      'solicitada', v_snap
    ) RETURNING id INTO v_solicitud_id;
  END IF;

  -- Confirmar
  SELECT * INTO v_result FROM public.confirm_baja_alumno(v_solicitud_id, p_notas, p_email_notificar);

  solicitud_id := v_solicitud_id;
  alumno_id := v_result.alumno_id;
  mp_preapproval_ids := v_result.mp_preapproval_ids;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_devolucion(uuid, numeric, text, text, text, date, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dar_baja_directa(uuid, text, text, text, text, boolean) TO authenticated;
