CREATE OR REPLACE FUNCTION public.suscripcion_da_acceso_entrenamientos(
  _estado text, _fecha_inicio date, _fecha_fin date, _cancelada_at timestamptz,
  _cancelada_motivo text, _mp_status text, _origen text, _hoy date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  -- Espejo de getEffectiveSubStatus (src/lib/subscriptionStatus.ts):
  -- acceso solo con estado efectivo activa / pendiente_verificacion / pago_pendiente (gracia día 1-5).
  SELECT CASE
    WHEN _cancelada_at IS NOT NULL THEN
      _fecha_fin IS NOT NULL AND _hoy <= _fecha_fin
      AND NOT (lower(coalesce(_cancelada_motivo,'')) ~ '(baja|cleanup|huerfana|removido)')
      AND (_mp_status = 'approved' OR _origen IN ('cargado_admin','automatico') OR _estado IN ('activa','finalizada'))
    WHEN _estado = 'pendiente_verificacion' THEN true
    WHEN _estado = 'vencida' THEN
      (_mp_status = 'approved' OR _origen IN ('cargado_admin','automatico'))
      AND _fecha_fin IS NOT NULL AND _hoy <= _fecha_fin
    WHEN _estado = 'pendiente' THEN
      -- Renovación impaga: gracia del día 1 al 5 del mes del nuevo período.
      _origen = 'renovacion_pendiente' AND _fecha_inicio IS NOT NULL
      AND date_trunc('month', _fecha_inicio) = date_trunc('month', _hoy)
      AND extract(day FROM _hoy) <= 5
    WHEN _estado = 'activa' THEN
      _fecha_fin IS NULL OR _hoy <= _fecha_fin
      OR (
        NOT (_mp_status = 'approved' OR _origen IN ('cargado_admin','automatico'))
        AND date_trunc('month', _hoy) = date_trunc('month', _fecha_fin) + interval '1 month'
        AND extract(day FROM _hoy) <= 5
      )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.alumno_puede_ver_entrenamientos(_alumno_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.alumnos a
    WHERE a.id = _alumno_id
      AND (
        -- Staff (rol real admin/coach) no queda restringido por deuda de su ficha de alumno.
        (a.user_id IS NOT NULL AND (public.has_role(a.user_id,'admin'::app_role) OR public.has_role(a.user_id,'coach'::app_role)))
        OR (
          a.estado IN ('activo','vacaciones')
          AND EXISTS (
            SELECT 1 FROM public.suscripciones s
            WHERE s.alumno_id = a.id
              AND public.suscripcion_da_acceso_entrenamientos(
                s.estado::text, s.fecha_inicio::date, s.fecha_fin::date, s.cancelada_at,
                s.cancelada_motivo, s.mp_status, s.origen_registro,
                (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
          )
        )
      )
  )
$function$;

GRANT EXECUTE ON FUNCTION public.suscripcion_da_acceso_entrenamientos(text,date,date,timestamptz,text,text,text,date) TO authenticated, service_role;