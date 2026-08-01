SET LOCAL app.price_sync = 'on';

UPDATE public.suscripciones
SET estado = 'cancelada',
    cancelada_at = now(),
    notas = COALESCE(notas,'') || ' | CANCELADA_POR_SOPORTE: pausa creada con fechas de próximo período por bug de contexto de renovación anticipada',
    updated_at = now()
WHERE id = 'd36823df-9fff-4bc9-b162-25381bd9edd9'
  AND estado <> 'cancelada';

INSERT INTO public.audit_log (user_role, action, entity_type, entity_id, details)
VALUES (
  'system',
  'correccion_pausa_bug',
  'suscripciones',
  'd36823df-9fff-4bc9-b162-25381bd9edd9',
  jsonb_build_object(
    'motivo', 'Pausa creada al elegir "proximo periodo" heredo fechas 2026-09-01/2026-09-30 y afecto el periodo actual',
    'accion', 'Se cancela la pausa (no estaba paga); se mantiene vigente Grupal 2x por semana hasta 2026-08-31'
  )
);