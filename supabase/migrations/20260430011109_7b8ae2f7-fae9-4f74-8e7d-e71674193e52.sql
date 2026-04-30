-- Editar cuota 2 (no tiene pagos validados)
UPDATE public.event_installments
SET label = 'Cuota 1 - Mayo (editada)',
    amount = 1400,
    due_date = '2026-05-20'
WHERE event_id = 'f74b749c-ba29-4da6-9b36-afcd3908c977' AND number = 2;

-- Restaurar valores originales para no afectar QA visual
UPDATE public.event_installments
SET label = 'Cuota 1',
    amount = 1370,
    due_date = '2026-05-15'
WHERE event_id = 'f74b749c-ba29-4da6-9b36-afcd3908c977' AND number = 2;