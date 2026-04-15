-- Fix subscriptions incorrectly marked as 'vencida' when fecha_fin has not passed yet
UPDATE suscripciones
SET estado = 'activa', updated_at = now()
WHERE estado = 'vencida'
  AND fecha_fin::date >= CURRENT_DATE
  AND cancelada_at IS NULL;

-- Also fix fecha_fin that are not last day of month (e.g. May 1 should be April 30)
UPDATE suscripciones
SET fecha_fin = (DATE_TRUNC('month', fecha_fin::date) - INTERVAL '1 day')::date,
    updated_at = now()
WHERE fecha_fin::date = (DATE_TRUNC('month', fecha_fin::date))::date
  AND estado IN ('activa', 'pendiente', 'pendiente_verificacion')
  AND cancelada_at IS NULL;