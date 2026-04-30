-- Sincronizar espejo para todos los eventos que tengan cuotas activas
-- Esto deja metadata.installments alineado con event_installments (cuotas activas)
WITH active_installments AS (
  SELECT
    event_id,
    jsonb_agg(
      jsonb_build_object(
        'number', number,
        'label', label,
        'amount', amount::text,
        'due_date', COALESCE(due_date::text, ''),
        'currency', currency
      )
      ORDER BY sort_order, number
    ) AS items
  FROM public.event_installments
  WHERE active = true
  GROUP BY event_id
)
UPDATE public.events e
SET metadata = COALESCE(e.metadata, '{}'::jsonb)
            || jsonb_build_object(
                 'installments', ai.items,
                 'installments_enabled', true
               )
FROM active_installments ai
WHERE e.id = ai.event_id;

-- Eventos que tienen registros en event_installments pero ninguno activo: vaciar espejo
WITH events_with_only_inactive AS (
  SELECT event_id
  FROM public.event_installments
  GROUP BY event_id
  HAVING bool_and(active = false)
)
UPDATE public.events e
SET metadata = COALESCE(e.metadata, '{}'::jsonb)
            || jsonb_build_object(
                 'installments', '[]'::jsonb,
                 'installments_enabled', false
               )
FROM events_with_only_inactive ei
WHERE e.id = ei.event_id;