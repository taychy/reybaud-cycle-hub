SET LOCAL session_replication_role = 'replica';
UPDATE public.suscripciones
SET estado='vencida',
    notas = COALESCE(notas,'') || E'\n[FIX 2026-07-01] Expirada manualmente: fecha_fin 2026-06-30, cron aún no había corrido y bloqueaba nuevo pago.'
WHERE id='f563f678-8cb2-4648-884d-26ea946b9574';
SET LOCAL session_replication_role = 'origin';