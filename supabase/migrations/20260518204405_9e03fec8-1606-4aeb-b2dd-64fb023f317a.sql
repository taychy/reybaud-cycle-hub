
-- 1. Tabla de pagos múltiples por cuota
CREATE TABLE public.gastos_ejecucion_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucion_id uuid NOT NULL REFERENCES public.gastos_ejecuciones(id) ON DELETE CASCADE,
  gasto_id uuid REFERENCES public.gastos(id) ON DELETE SET NULL,
  monto numeric NOT NULL,
  fecha date NOT NULL,
  forma_pago text NOT NULL,
  notas text,
  pagado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gastos_ejec_pagos_ejec ON public.gastos_ejecucion_pagos(ejecucion_id);

ALTER TABLE public.gastos_ejecucion_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin can view pagos"
  ON public.gastos_ejecucion_pagos FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super admin can insert pagos"
  ON public.gastos_ejecucion_pagos FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "super admin can update pagos"
  ON public.gastos_ejecucion_pagos FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super admin can delete pagos"
  ON public.gastos_ejecucion_pagos FOR DELETE
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER set_updated_at_gastos_ejec_pagos
  BEFORE UPDATE ON public.gastos_ejecucion_pagos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Migrar pagos existentes (1 fila por cuota pagada)
INSERT INTO public.gastos_ejecucion_pagos (ejecucion_id, gasto_id, monto, fecha, forma_pago, notas, pagado_por, created_at)
SELECT id, gasto_id, COALESCE(monto_pagado, monto_previsto), COALESCE(fecha_pago, CURRENT_DATE),
       COALESCE(forma_pago, 'transferencia'), notas, pagado_por, COALESCE(updated_at, now())
FROM public.gastos_ejecuciones
WHERE estado = 'pagado' AND monto_pagado IS NOT NULL;

-- 3. Helper: recalcular estado y totales de una ejecución a partir de sus pagos
CREATE OR REPLACE FUNCTION public.recalc_gasto_ejecucion(p_ejec_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_ejec record;
  v_last record;
  v_new_estado text;
BEGIN
  SELECT * INTO v_ejec FROM public.gastos_ejecuciones WHERE id = p_ejec_id;
  IF v_ejec IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(monto), 0) INTO v_total
  FROM public.gastos_ejecucion_pagos WHERE ejecucion_id = p_ejec_id;

  SELECT * INTO v_last FROM public.gastos_ejecucion_pagos
    WHERE ejecucion_id = p_ejec_id
    ORDER BY fecha DESC, created_at DESC LIMIT 1;

  IF v_total <= 0 THEN
    IF v_ejec.fecha_vencimiento IS NOT NULL AND v_ejec.fecha_vencimiento < CURRENT_DATE THEN
      v_new_estado := 'vencido';
    ELSE
      v_new_estado := 'pendiente';
    END IF;
  ELSIF v_total >= COALESCE(v_ejec.monto_previsto, 0) THEN
    v_new_estado := 'pagado';
  ELSE
    v_new_estado := 'parcial';
  END IF;

  UPDATE public.gastos_ejecuciones
  SET estado = v_new_estado::estado_ejecucion_gasto,
      monto_pagado = CASE WHEN v_total > 0 THEN v_total ELSE NULL END,
      fecha_pago = CASE WHEN v_total > 0 THEN v_last.fecha ELSE NULL END,
      forma_pago = CASE WHEN v_total > 0 THEN v_last.forma_pago ELSE NULL END,
      updated_at = now()
  WHERE id = p_ejec_id;
END;
$$;

-- 4. Registrar un nuevo pago parcial o total
CREATE OR REPLACE FUNCTION public.register_gasto_pago(
  p_ejec_id uuid, p_monto numeric, p_fecha date,
  p_forma_pago text, p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ejec record;
  v_rec record;
  v_gasto_id uuid;
  v_pago_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar pagos';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  SELECT * INTO v_ejec FROM public.gastos_ejecuciones WHERE id = p_ejec_id;
  IF v_ejec IS NULL THEN RAISE EXCEPTION 'Ejecución no encontrada'; END IF;
  SELECT * INTO v_rec FROM public.gastos_recurrentes WHERE id = v_ejec.recurrente_id;

  INSERT INTO public.gastos (
    categoria, subcategoria, descripcion, monto, moneda, fecha,
    recurrente, frecuencia, proveedor, notas, forma_pago
  ) VALUES (
    v_rec.categoria, v_rec.ambito::text,
    v_rec.concepto || ' (' || v_ejec.mes || ')',
    p_monto, v_ejec.moneda, p_fecha,
    true, v_rec.frecuencia::text, v_rec.proveedor, p_notas, p_forma_pago
  ) RETURNING id INTO v_gasto_id;

  INSERT INTO public.gastos_ejecucion_pagos (
    ejecucion_id, gasto_id, monto, fecha, forma_pago, notas, pagado_por
  ) VALUES (
    p_ejec_id, v_gasto_id, p_monto, p_fecha, p_forma_pago, p_notas, auth.uid()
  ) RETURNING id INTO v_pago_id;

  PERFORM public.recalc_gasto_ejecucion(p_ejec_id);
  RETURN v_pago_id;
END;
$$;

-- 5. Editar un pago existente
CREATE OR REPLACE FUNCTION public.update_gasto_pago(
  p_pago_id uuid, p_monto numeric, p_fecha date,
  p_forma_pago text, p_notas text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede editar pagos';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  SELECT * INTO v_pago FROM public.gastos_ejecucion_pagos WHERE id = p_pago_id;
  IF v_pago IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;

  UPDATE public.gastos_ejecucion_pagos
  SET monto = p_monto, fecha = p_fecha, forma_pago = p_forma_pago,
      notas = p_notas, updated_at = now()
  WHERE id = p_pago_id;

  IF v_pago.gasto_id IS NOT NULL THEN
    UPDATE public.gastos
    SET monto = p_monto, fecha = p_fecha, forma_pago = p_forma_pago,
        notas = p_notas, updated_at = now()
    WHERE id = v_pago.gasto_id;
  END IF;

  PERFORM public.recalc_gasto_ejecucion(v_pago.ejecucion_id);
END;
$$;

-- 6. Borrar un pago
CREATE OR REPLACE FUNCTION public.delete_gasto_pago(p_pago_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede eliminar pagos';
  END IF;

  SELECT * INTO v_pago FROM public.gastos_ejecucion_pagos WHERE id = p_pago_id;
  IF v_pago IS NULL THEN RETURN; END IF;

  DELETE FROM public.gastos_ejecucion_pagos WHERE id = p_pago_id;
  IF v_pago.gasto_id IS NOT NULL THEN
    DELETE FROM public.gastos WHERE id = v_pago.gasto_id;
  END IF;

  PERFORM public.recalc_gasto_ejecucion(v_pago.ejecucion_id);
END;
$$;
