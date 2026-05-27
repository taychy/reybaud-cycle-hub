
-- 1) Columnas nuevas en gastos
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_status TEXT,
  ADD COLUMN IF NOT EXISTS mp_external_reference TEXT,
  ADD COLUMN IF NOT EXISTS origen_registro TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS estado_conciliacion TEXT NOT NULL DEFAULT 'conciliado';

CREATE UNIQUE INDEX IF NOT EXISTS gastos_mp_payment_id_uidx
  ON public.gastos(mp_payment_id) WHERE mp_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gastos_estado_conciliacion_idx
  ON public.gastos(estado_conciliacion) WHERE estado_conciliacion = 'pendiente_conciliar';

-- 2) Log de webhooks MP
CREATE TABLE IF NOT EXISTS public.gastos_mp_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id TEXT,
  mp_event_type TEXT,
  signature_valid BOOLEAN,
  http_status INTEGER,
  decision TEXT,
  gasto_id UUID,
  error TEXT,
  raw_headers JSONB,
  raw_body JSONB,
  mp_payment_raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gastos_mp_webhook_log TO authenticated;
GRANT ALL  ON public.gastos_mp_webhook_log TO service_role;

ALTER TABLE public.gastos_mp_webhook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin can view mp webhook log" ON public.gastos_mp_webhook_log;
CREATE POLICY "Super admin can view mp webhook log"
ON public.gastos_mp_webhook_log
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 3) RPC: aplicar pago MP a un gasto existente
CREATE OR REPLACE FUNCTION public.apply_mp_payment_to_gasto(
  p_gasto_id UUID,
  p_mp_payment_id TEXT,
  p_mp_status TEXT,
  p_monto NUMERIC,
  p_fecha DATE,
  p_external_reference TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.gastos
  SET mp_payment_id = p_mp_payment_id,
      mp_status = p_mp_status,
      mp_external_reference = p_external_reference,
      origen_registro = CASE WHEN origen_registro = 'manual' THEN 'mp_link' ELSE origen_registro END,
      estado_conciliacion = 'conciliado',
      monto = COALESCE(p_monto, monto),
      fecha = COALESCE(p_fecha, fecha),
      forma_pago = COALESCE(forma_pago, 'mercadopago'),
      updated_at = now()
  WHERE id = p_gasto_id;
END;
$$;

-- 4) RPC: crear gasto desde webhook MP cuando no hay external_reference
CREATE OR REPLACE FUNCTION public.create_gasto_from_mp(
  p_mp_payment_id TEXT,
  p_mp_status TEXT,
  p_monto NUMERIC,
  p_moneda TEXT,
  p_fecha DATE,
  p_descripcion TEXT,
  p_proveedor TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  -- Idempotencia
  SELECT id INTO v_id FROM public.gastos WHERE mp_payment_id = p_mp_payment_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.gastos
    SET mp_status = p_mp_status, updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.gastos (
    categoria, subcategoria, descripcion, monto, moneda, fecha,
    forma_pago, proveedor, notas,
    mp_payment_id, mp_status, origen_registro, estado_conciliacion
  ) VALUES (
    'Por conciliar', 'mp_webhook',
    COALESCE(p_descripcion, 'Pago Mercado Pago ' || p_mp_payment_id),
    p_monto, COALESCE(p_moneda, 'ARS'), p_fecha,
    'mercadopago', p_proveedor,
    'Generado automáticamente desde webhook MP. Revisar y conciliar.',
    p_mp_payment_id, p_mp_status, 'mp_webhook', 'pendiente_conciliar'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
