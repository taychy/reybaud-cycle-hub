CREATE UNIQUE INDEX IF NOT EXISTS uniq_sub_activa_alumno_plan_periodo
ON public.suscripciones (alumno_id, plan_id, fecha_fin)
WHERE estado IN ('activa','pendiente_verificacion','pendiente','pago_pendiente')
  AND cancelada_at IS NULL;