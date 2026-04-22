-- Limpieza: suscripciones con cancelada_at seteado pero estado != 'cancelada'
-- Causadas por bug en cancelación desde portal de alumno (solo seteaba cancelada_at)
UPDATE public.suscripciones
SET estado = 'cancelada',
    cancelada_motivo = COALESCE(cancelada_motivo, 'Cancelada por el alumno (corrección de datos)'),
    updated_at = now()
WHERE cancelada_at IS NOT NULL
  AND estado <> 'cancelada';