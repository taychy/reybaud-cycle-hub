-- 1) Add direccion column to classify MP account movements
ALTER TABLE public.mp_account_movements
  ADD COLUMN IF NOT EXISTS direccion text NOT NULL DEFAULT 'ingreso'
    CHECK (direccion IN ('ingreso','egreso','reserva_tecnica')),
  ADD COLUMN IF NOT EXISTS gasto_id uuid NULL REFERENCES public.gastos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categorizado_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS categorizado_por uuid NULL;

CREATE INDEX IF NOT EXISTS idx_mp_movs_direccion ON public.mp_account_movements(direccion);
CREATE INDEX IF NOT EXISTS idx_mp_movs_egreso_pendiente
  ON public.mp_account_movements(fecha_movimiento DESC)
  WHERE direccion = 'egreso' AND gasto_id IS NULL;

-- 2) Classifier function based on raw MP payload
CREATE OR REPLACE FUNCTION public.classify_mp_movement_direccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op text;
  coll text;
  payer_id text;
BEGIN
  op := NEW.raw->>'operation_type';
  coll := NEW.raw->>'collector_id';
  payer_id := NEW.raw->'payer'->>'id';

  IF op = 'partition_transfer' THEN
    NEW.direccion := 'reserva_tecnica';
  ELSIF op = 'money_transfer' AND (coll IS NULL OR coll = '') THEN
    NEW.direccion := 'egreso';
  ELSE
    NEW.direccion := 'ingreso';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_mp_movement ON public.mp_account_movements;
CREATE TRIGGER trg_classify_mp_movement
  BEFORE INSERT OR UPDATE OF raw ON public.mp_account_movements
  FOR EACH ROW EXECUTE FUNCTION public.classify_mp_movement_direccion();

-- 3) Backfill existing rows
UPDATE public.mp_account_movements
SET direccion = CASE
  WHEN raw->>'operation_type' = 'partition_transfer' THEN 'reserva_tecnica'
  WHEN raw->>'operation_type' = 'money_transfer'
       AND (raw->>'collector_id' IS NULL OR raw->>'collector_id' = '')
       THEN 'egreso'
  ELSE 'ingreso'
END;

-- 4) RPC to categorize an MP egreso as a formal gasto (with dedup guard)
CREATE OR REPLACE FUNCTION public.mp_egreso_to_gasto(
  _movement_id uuid,
  _categoria text,
  _subcategoria text,
  _descripcion text,
  _proveedor text,
  _unidad_negocio text,
  _notas text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.mp_account_movements%ROWTYPE;
  new_gasto_id uuid;
  existing_gasto_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Solo admins pueden categorizar egresos MP';
  END IF;

  SELECT * INTO m FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento MP no encontrado'; END IF;
  IF m.direccion <> 'egreso' THEN RAISE EXCEPTION 'Este movimiento no es un egreso'; END IF;
  IF m.gasto_id IS NOT NULL THEN RAISE EXCEPTION 'Ya fue categorizado como gasto'; END IF;

  -- Dedup: block if a gasto already exists with this mp_payment_id
  SELECT id INTO existing_gasto_id FROM public.gastos WHERE mp_payment_id = m.mp_payment_id;
  IF existing_gasto_id IS NOT NULL THEN
    UPDATE public.mp_account_movements
       SET gasto_id = existing_gasto_id, categorizado_at = now(), categorizado_por = auth.uid()
     WHERE id = _movement_id;
    RETURN existing_gasto_id;
  END IF;

  INSERT INTO public.gastos (
    categoria, subcategoria, descripcion, monto, moneda, fecha,
    proveedor, notas, forma_pago, origen_registro, estado_conciliacion,
    mp_payment_id, mp_status, unidad_negocio, registrado_por
  ) VALUES (
    COALESCE(_categoria,'otros'),
    _subcategoria,
    COALESCE(NULLIF(_descripcion,''), 'Egreso MP ' || m.mp_payment_id),
    m.amount, m.currency, m.fecha_movimiento::date,
    _proveedor, _notas, 'mercado_pago', 'mp_egreso', 'conciliado',
    m.mp_payment_id, m.status, COALESCE(_unidad_negocio,'compartido'), auth.uid()
  ) RETURNING id INTO new_gasto_id;

  UPDATE public.mp_account_movements
     SET gasto_id = new_gasto_id, categorizado_at = now(), categorizado_por = auth.uid()
   WHERE id = _movement_id;

  RETURN new_gasto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mp_egreso_to_gasto(uuid,text,text,text,text,text,text) TO authenticated;