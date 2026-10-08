CREATE OR REPLACE FUNCTION public.suscripcion_da_acceso_entrenamientos(
  _estado text, _fecha_inicio date, _fecha_fin date, _cancelada_at timestamptz,
  _cancelada_motivo text, _mp_status text, _origen text, _hoy date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  -- Espejo de getEffectiveSubStatus: acceso con estado efectivo activa / pendiente_verificacion / pago_pendiente.
  WITH p AS (SELECT (coalesce(_mp_status,'') = 'approved' OR coalesce(_origen,'') IN ('cargado_admin','automatico')) AS pagada)
  SELECT coalesce(CASE
    WHEN _cancelada_at IS NOT NULL THEN
      _fecha_fin IS NOT NULL AND _hoy <= _fecha_fin
      AND NOT (lower(coalesce(_cancelada_motivo,'')) ~ '(baja|cleanup|huerfana|removido)')
      AND (p.pagada OR _estado IN ('activa','finalizada'))
    WHEN _estado = 'pendiente_verificacion' THEN true
    WHEN _estado = 'vencida' THEN p.pagada AND _fecha_fin IS NOT NULL AND _hoy <= _fecha_fin
    WHEN _estado = 'pendiente' THEN
      coalesce(_origen,'') = 'renovacion_pendiente' AND _fecha_inicio IS NOT NULL
      AND date_trunc('month', _fecha_inicio) = date_trunc('month', _hoy)
      AND extract(day FROM _hoy) <= 5
    WHEN _estado = 'activa' THEN
      _fecha_fin IS NULL OR _hoy <= _fecha_fin
      OR (NOT p.pagada
          AND date_trunc('month', _hoy) = date_trunc('month', _fecha_fin) + interval '1 month'
          AND extract(day FROM _hoy) <= 5)
    ELSE false
  END, false) FROM p
$$;