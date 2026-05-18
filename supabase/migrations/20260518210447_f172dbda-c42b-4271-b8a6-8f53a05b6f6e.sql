
-- Tipo de movimiento de deuda
DO $$ BEGIN
  CREATE TYPE public.gasto_deuda_tipo AS ENUM ('cargo','ajuste','pago');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla de movimientos de deuda por recurrente
CREATE TABLE IF NOT EXISTS public.gastos_deuda_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrente_id uuid NOT NULL REFERENCES public.gastos_recurrentes(id) ON DELETE CASCADE,
  tipo public.gasto_deuda_tipo NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0),
  moneda text NOT NULL DEFAULT 'ARS',
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  concepto text,
  forma_pago text,
  notas text,
  gasto_id uuid REFERENCES public.gastos(id) ON DELETE SET NULL,
  ejecucion_id uuid REFERENCES public.gastos_ejecuciones(id) ON DELETE SET NULL,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_deuda_mov_rec ON public.gastos_deuda_movimientos(recurrente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_deuda_mov_fecha ON public.gastos_deuda_movimientos(fecha);

ALTER TABLE public.gastos_deuda_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manage deuda"
ON public.gastos_deuda_movimientos
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_gastos_deuda_mov_updated
BEFORE UPDATE ON public.gastos_deuda_movimientos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Función: saldo de deuda por recurrente (automática + manuales)
CREATE OR REPLACE FUNCTION public.get_gasto_recurrente_saldo_deuda(p_rec_id uuid)
RETURNS TABLE (
  recurrente_id uuid,
  deuda_automatica numeric,
  cargos_manuales numeric,
  ajustes numeric,
  pagos_deuda numeric,
  saldo_total numeric,
  moneda text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moneda text;
BEGIN
  SELECT r.moneda INTO v_moneda FROM public.gastos_recurrentes r WHERE r.id = p_rec_id;

  RETURN QUERY
  WITH auto_d AS (
    SELECT COALESCE(SUM(GREATEST(
      COALESCE(e.monto_previsto,0) - COALESCE((
        SELECT SUM(p.monto) FROM public.gastos_ejecucion_pagos p WHERE p.ejecucion_id = e.id
      ),0), 0
    )),0) AS total
    FROM public.gastos_ejecuciones e
    WHERE e.recurrente_id = p_rec_id
      AND e.estado IN ('parcial','vencido')
      AND e.fecha_vencimiento < CURRENT_DATE
  ),
  movs AS (
    SELECT tipo, COALESCE(SUM(monto),0) AS total
    FROM public.gastos_deuda_movimientos
    WHERE recurrente_id = p_rec_id
    GROUP BY tipo
  )
  SELECT
    p_rec_id,
    (SELECT total FROM auto_d)::numeric,
    COALESCE((SELECT total FROM movs WHERE tipo = 'cargo'),0)::numeric,
    COALESCE((SELECT total FROM movs WHERE tipo = 'ajuste'),0)::numeric,
    COALESCE((SELECT total FROM movs WHERE tipo = 'pago'),0)::numeric,
    ((SELECT total FROM auto_d)
      + COALESCE((SELECT total FROM movs WHERE tipo = 'cargo'),0)
      + COALESCE((SELECT total FROM movs WHERE tipo = 'ajuste'),0)
      - COALESCE((SELECT total FROM movs WHERE tipo = 'pago'),0))::numeric,
    v_moneda;
END;
$$;

-- Función: saldos de deuda para TODOS los recurrentes (para matriz)
CREATE OR REPLACE FUNCTION public.get_all_gastos_saldo_deuda()
RETURNS TABLE (
  recurrente_id uuid,
  saldo_total numeric,
  moneda text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH auto_d AS (
    SELECT e.recurrente_id,
      SUM(GREATEST(
        COALESCE(e.monto_previsto,0) - COALESCE((
          SELECT SUM(p.monto) FROM public.gastos_ejecucion_pagos p WHERE p.ejecucion_id = e.id
        ),0), 0
      )) AS total
    FROM public.gastos_ejecuciones e
    WHERE e.estado IN ('parcial','vencido')
      AND e.fecha_vencimiento < CURRENT_DATE
    GROUP BY e.recurrente_id
  ),
  movs AS (
    SELECT recurrente_id,
      SUM(CASE WHEN tipo='cargo' THEN monto WHEN tipo='ajuste' THEN monto WHEN tipo='pago' THEN -monto ELSE 0 END) AS total
    FROM public.gastos_deuda_movimientos
    GROUP BY recurrente_id
  )
  SELECT r.id,
    (COALESCE(a.total,0) + COALESCE(m.total,0))::numeric,
    r.moneda
  FROM public.gastos_recurrentes r
  LEFT JOIN auto_d a ON a.recurrente_id = r.id
  LEFT JOIN movs   m ON m.recurrente_id = r.id
  WHERE (COALESCE(a.total,0) + COALESCE(m.total,0)) > 0;
$$;

-- RPC: registrar cargo o ajuste de deuda (sin asiento contable)
CREATE OR REPLACE FUNCTION public.register_gasto_deuda_cargo(
  p_rec_id uuid, p_tipo text, p_monto numeric, p_fecha date,
  p_concepto text DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_rec record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar deuda';
  END IF;
  IF p_tipo NOT IN ('cargo','ajuste') THEN
    RAISE EXCEPTION 'Tipo inválido (debe ser cargo o ajuste)';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  SELECT * INTO v_rec FROM public.gastos_recurrentes WHERE id = p_rec_id;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'Recurrente no encontrado'; END IF;

  INSERT INTO public.gastos_deuda_movimientos (
    recurrente_id, tipo, monto, moneda, fecha, concepto, notas, creado_por
  ) VALUES (
    p_rec_id, p_tipo::gasto_deuda_tipo, p_monto, v_rec.moneda, p_fecha, p_concepto, p_notas, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- RPC: registrar pago a deuda (genera asiento contable en gastos)
CREATE OR REPLACE FUNCTION public.register_gasto_deuda_pago(
  p_rec_id uuid, p_monto numeric, p_fecha date, p_forma_pago text,
  p_notas text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_gasto_id uuid;
  v_rec record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede registrar pagos';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  SELECT * INTO v_rec FROM public.gastos_recurrentes WHERE id = p_rec_id;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'Recurrente no encontrado'; END IF;

  -- Asiento contable
  INSERT INTO public.gastos (
    categoria, subcategoria, descripcion, monto, moneda, fecha,
    recurrente, frecuencia, proveedor, notas, forma_pago
  ) VALUES (
    v_rec.categoria, v_rec.ambito::text,
    'Pago a deuda: ' || v_rec.concepto,
    p_monto, v_rec.moneda, p_fecha,
    true, v_rec.frecuencia::text, v_rec.proveedor,
    COALESCE(p_notas,'') || ' [pago-deuda]', p_forma_pago
  ) RETURNING id INTO v_gasto_id;

  INSERT INTO public.gastos_deuda_movimientos (
    recurrente_id, tipo, monto, moneda, fecha, forma_pago, notas, gasto_id, creado_por
  ) VALUES (
    p_rec_id, 'pago', p_monto, v_rec.moneda, p_fecha, p_forma_pago, p_notas, v_gasto_id, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- RPC: actualizar movimiento de deuda
CREATE OR REPLACE FUNCTION public.update_gasto_deuda_mov(
  p_id uuid, p_monto numeric, p_fecha date,
  p_forma_pago text DEFAULT NULL, p_concepto text DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mov record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede editar deuda';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  SELECT * INTO v_mov FROM public.gastos_deuda_movimientos WHERE id = p_id;
  IF v_mov IS NULL THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;

  UPDATE public.gastos_deuda_movimientos
  SET monto = p_monto, fecha = p_fecha,
      forma_pago = COALESCE(p_forma_pago, forma_pago),
      concepto = COALESCE(p_concepto, concepto),
      notas = COALESCE(p_notas, notas),
      updated_at = now()
  WHERE id = p_id;

  IF v_mov.gasto_id IS NOT NULL THEN
    UPDATE public.gastos
    SET monto = p_monto, fecha = p_fecha,
        forma_pago = COALESCE(p_forma_pago, forma_pago),
        notas = COALESCE(p_notas, notas),
        updated_at = now()
    WHERE id = v_mov.gasto_id;
  END IF;
END; $$;

-- RPC: borrar movimiento de deuda
CREATE OR REPLACE FUNCTION public.delete_gasto_deuda_mov(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mov record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede eliminar deuda';
  END IF;
  SELECT * INTO v_mov FROM public.gastos_deuda_movimientos WHERE id = p_id;
  IF v_mov IS NULL THEN RETURN; END IF;

  DELETE FROM public.gastos_deuda_movimientos WHERE id = p_id;
  IF v_mov.gasto_id IS NOT NULL THEN
    DELETE FROM public.gastos WHERE id = v_mov.gasto_id;
  END IF;
END; $$;
