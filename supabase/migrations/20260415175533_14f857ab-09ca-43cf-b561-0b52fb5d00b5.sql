
-- Add explicit columns
ALTER TABLE public.suscripciones
  ADD COLUMN metodo_pago text NOT NULL DEFAULT 'efectivo',
  ADD COLUMN origen_registro text NOT NULL DEFAULT 'cargado_admin';

-- Migrate historical data: metodo_pago
-- 1) MercadoPago (has mp_payment_id or gateway statuses)
UPDATE suscripciones SET metodo_pago = 'mercadopago'
WHERE mp_payment_id IS NOT NULL
   OR lower(trim(mp_status)) IN ('approved', '400', 'cancelled', 'rejected', 'pending', 'in_process', 'mercadopago', 'mp');

-- 2) Efectivo
UPDATE suscripciones SET metodo_pago = 'efectivo'
WHERE metodo_pago != 'mercadopago'
  AND lower(trim(mp_status)) IN ('efectivo', 'cash');

-- 3) Transferencia
UPDATE suscripciones SET metodo_pago = 'transferencia'
WHERE metodo_pago != 'mercadopago'
  AND lower(trim(mp_status)) = 'transferencia';

-- 4) Tarjeta
UPDATE suscripciones SET metodo_pago = 'tarjeta'
WHERE metodo_pago != 'mercadopago'
  AND lower(trim(mp_status)) IN ('tarjeta', 'card');

-- 5) Plataforma externa
UPDATE suscripciones SET metodo_pago = 'plataforma_externa'
WHERE metodo_pago != 'mercadopago'
  AND lower(trim(mp_status)) IN ('externo', 'plataforma_externa', 'otro');

-- 6) Manual/Conciliado → efectivo (already default, but be explicit)
UPDATE suscripciones SET metodo_pago = 'efectivo'
WHERE metodo_pago = 'efectivo'
  AND lower(trim(mp_status)) IN ('manual', 'conciliado');

-- Migrate historical data: origen_registro
-- 1) Automático (MercadoPago gateway)
UPDATE suscripciones SET origen_registro = 'automatico'
WHERE mp_payment_id IS NOT NULL
   OR lower(trim(mp_status)) IN ('approved', '400', 'cancelled', 'rejected', 'pending', 'in_process');

-- 2) Informado por alumno
UPDATE suscripciones SET origen_registro = 'informado_alumno'
WHERE origen_registro != 'automatico'
  AND (estado = 'pendiente_verificacion' OR lower(trim(mp_status)) = 'pendiente_verificacion');

-- 3) Everything else stays as 'cargado_admin' (default)

-- Create index for filtering
CREATE INDEX idx_suscripciones_metodo_pago ON public.suscripciones (metodo_pago);
CREATE INDEX idx_suscripciones_origen_registro ON public.suscripciones (origen_registro);
