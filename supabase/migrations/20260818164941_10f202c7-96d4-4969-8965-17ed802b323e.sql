-- Guard específico del flujo de renovación anticipada (early renewal).
-- Impide que un contexto stale de localStorage cree una suscripción de un mes pasado.
CREATE OR REPLACE FUNCTION public.guard_early_renewal_periodo_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes_actual date;
BEGIN
  -- Sólo aplica al flujo early renewal (marcador en notas).
  IF NEW.notas IS NULL OR NEW.notas NOT LIKE '%EARLY_RENEWAL_FROM:%' THEN
    RETURN NEW;
  END IF;

  -- Escape hatch para procesos internos / backfills / reparaciones controladas.
  IF current_setting('app.sub_internal', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_inicio IS NULL THEN
    RETURN NEW;
  END IF;

  v_mes_actual := date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date;

  IF NEW.fecha_inicio < v_mes_actual THEN
    -- En UPDATE, no bloqueamos si el período no cambió (fila histórica preexistente).
    IF TG_OP = 'UPDATE' AND OLD.fecha_inicio IS NOT DISTINCT FROM NEW.fecha_inicio
       AND OLD.notas IS NOT DISTINCT FROM NEW.notas THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'EARLY_RENEWAL_PERIODO_STALE: la renovación anticipada no puede crear un período anterior al mes en curso (fecha_inicio=%, mes actual=%)',
      NEW.fecha_inicio, v_mes_actual;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_early_renewal_periodo_stale ON public.suscripciones;
CREATE TRIGGER trg_guard_early_renewal_periodo_stale
BEFORE INSERT OR UPDATE ON public.suscripciones
FOR EACH ROW
EXECUTE FUNCTION public.guard_early_renewal_periodo_stale();

-- Monitoreo: misma forma de columnas que vw_pagos_inconsistencias para poder
-- unirla desde los consumidores sin modificar la vista existente.
CREATE OR REPLACE VIEW public.vw_inconsistencias_early_renewal AS
SELECT
  'EARLY_RENEWAL_PERIODO_STALE'::text AS tipo,
  'critica'::text AS severidad,
  s.alumno_id,
  TRIM(BOTH FROM (COALESCE(a.nombre, '') || ' ' || COALESCE(a.apellido, ''))) AS alumno_nombre,
  s.fecha_inicio AS fecha,
  s.mp_payment_id,
  'suscripciones'::text AS pago_origen,
  s.id AS pago_id,
  COALESCE(s.precio_final, s.precio_base, 0::numeric) AS monto_pago,
  COALESCE(p.moneda, 'ARS') AS moneda,
  'suscripcion'::text AS obligacion_tipo,
  s.id AS obligacion_id,
  COALESCE(s.precio_final, s.precio_base, 0::numeric) AS monto_obligacion,
  NULL::numeric AS pagado,
  NULL::numeric AS saldo,
  NULL::numeric AS diferencia,
  'Suscripción de renovación anticipada creada con un período anterior al mes de su creación (contexto stale de early renewal).'::text AS descripcion,
  jsonb_build_object(
    'estado', s.estado,
    'created_at', s.created_at,
    'notas', s.notas,
    'plan', p.nombre
  ) AS metadata
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN public.alumnos a ON a.id = s.alumno_id
WHERE s.notas LIKE '%EARLY_RENEWAL_FROM:%'
  AND s.fecha_inicio IS NOT NULL
  AND s.fecha_inicio < date_trunc('month', (s.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date;

GRANT SELECT ON public.vw_inconsistencias_early_renewal TO authenticated;
GRANT ALL ON public.vw_inconsistencias_early_renewal TO service_role;