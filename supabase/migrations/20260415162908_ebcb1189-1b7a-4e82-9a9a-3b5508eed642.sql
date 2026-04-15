-- Fix Karina's subscriptions: fecha_fin should be last day of March, not March 1
UPDATE suscripciones
SET fecha_fin = '2026-03-31'
WHERE alumno_id = 'e7b4aab7-d019-42da-b5f8-e5eb45ef835e'
  AND fecha_fin = '2026-03-01'
  AND fecha_inicio = '2026-03-01';

-- Also fix any other subscriptions across ALL students where fecha_fin = fecha_inicio
-- (which indicates the timezone bug hit them too)
-- For monthly plans, set fecha_fin to last day of that month
UPDATE suscripciones s
SET fecha_fin = (DATE_TRUNC('month', s.fecha_inicio) + INTERVAL '1 month' - INTERVAL '1 day')::date
FROM planes p
WHERE p.id = s.plan_id
  AND s.fecha_fin = s.fecha_inicio
  AND (p.frecuencia NOT IN ('trimestral', 'anual') OR p.frecuencia IS NULL);

-- For trimestral plans
UPDATE suscripciones s
SET fecha_fin = (DATE_TRUNC('month', s.fecha_inicio) + INTERVAL '3 months' - INTERVAL '1 day')::date
FROM planes p
WHERE p.id = s.plan_id
  AND s.fecha_fin = s.fecha_inicio
  AND p.frecuencia = 'trimestral';

-- For anual plans
UPDATE suscripciones s
SET fecha_fin = (DATE_TRUNC('month', s.fecha_inicio) + INTERVAL '12 months' - INTERVAL '1 day')::date
FROM planes p
WHERE p.id = s.plan_id
  AND s.fecha_fin = s.fecha_inicio
  AND p.frecuencia = 'anual';