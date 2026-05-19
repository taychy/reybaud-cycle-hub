
-- 1. Agregar columnas a facturas
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS origen_registro text;

CREATE INDEX IF NOT EXISTS idx_facturas_metodo_pago ON public.facturas(metodo_pago);
CREATE INDEX IF NOT EXISTS idx_facturas_origen_registro ON public.facturas(origen_registro);

-- 2. Backfill desde suscripciones
UPDATE public.facturas f
SET metodo_pago = s.metodo_pago,
    origen_registro = s.origen_registro
FROM public.suscripciones s
WHERE f.referencia_tipo = 'suscripcion'
  AND f.referencia_id = s.id
  AND (f.metodo_pago IS NULL OR f.origen_registro IS NULL);

-- 3. Backfill desde reservation_payments (último pago de la reserva)
WITH last_pay AS (
  SELECT DISTINCT ON (reservation_id)
    reservation_id, payment_method, created_at
  FROM public.reservation_payments
  WHERE status IN ('confirmado', 'informado')
  ORDER BY reservation_id, created_at DESC
)
UPDATE public.facturas f
SET metodo_pago = CASE
      WHEN lp.payment_method ILIKE '%mercado%' OR lp.payment_method ILIKE '%mp%' THEN 'mercadopago'
      WHEN lp.payment_method ILIKE '%transfer%' THEN 'transferencia'
      WHEN lp.payment_method ILIKE '%efectivo%' OR lp.payment_method ILIKE '%cash%' THEN 'efectivo'
      ELSE COALESCE(lp.payment_method, 'otro')
    END,
    origen_registro = COALESCE(f.origen_registro, 'cargado_admin')
FROM last_pay lp
WHERE f.referencia_tipo = 'evento'
  AND f.referencia_id = lp.reservation_id
  AND f.metodo_pago IS NULL;
