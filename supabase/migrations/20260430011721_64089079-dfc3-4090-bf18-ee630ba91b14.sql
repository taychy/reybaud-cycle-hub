-- Paso 1: Desactivar la cuota QA (simula click "Desactivar" en UI)
UPDATE public.event_installments
SET active = false
WHERE id = '8455a5c3-f47f-48f7-98c2-bebcc95f1a24';

-- Paso 2: Sincronizar espejo (simula syncMetadataMirror del editor)
WITH active_ins AS (
  SELECT jsonb_agg(
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
  WHERE event_id = 'f74b749c-ba29-4da6-9b36-afcd3908c977'
    AND active = true
)
UPDATE public.events
SET metadata = COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object(
                 'installments', COALESCE((SELECT items FROM active_ins), '[]'::jsonb),
                 'installments_enabled', (SELECT items FROM active_ins) IS NOT NULL
               )
WHERE id = 'f74b749c-ba29-4da6-9b36-afcd3908c977';