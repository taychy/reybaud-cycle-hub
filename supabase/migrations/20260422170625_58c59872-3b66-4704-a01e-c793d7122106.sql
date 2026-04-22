-- Limpieza histórica de mp_status: dejar solo estados reales de la pasarela Mercado Pago
UPDATE public.suscripciones
SET mp_status = NULL
WHERE mp_status IS NOT NULL
  AND mp_status NOT IN (
    'approved',
    'pending',
    'in_process',
    'rejected',
    'cancelled',
    'refunded',
    'charged_back',
    'authorized'
  );