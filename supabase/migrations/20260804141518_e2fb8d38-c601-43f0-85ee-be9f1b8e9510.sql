CREATE OR REPLACE FUNCTION public.audit_alumno_precios(_alumno_id uuid)
RETURNS TABLE (
  suscripcion_id uuid,
  plan_id uuid,
  plan_nombre text,
  estado text,
  fecha_inicio date,
  fecha_fin date,
  moneda text,
  precio_base numeric,
  precio_final numeric,
  precio_plan_actual numeric,
  precio_esperado numeric,
  diferencia numeric,
  origen_historial_id uuid,
  origen_fecha_vigencia date,
  origen_fecha_cambio timestamptz,
  origen_aplicado_at timestamptz,
  origen_aplicar_a text,
  origen_modificado_por uuid,
  sub_updated_at timestamptz,
  ultimo_job_aplicado_at timestamptz,
  ultimo_job_vigencia date,
  reproceso_fuera_de_orden boolean,
  aplicado_antes_de_vigencia boolean,
  desalineada boolean,
  diagnostico text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH subs AS (
    SELECT s.*, p.nombre AS plan_nombre, p.precio AS plan_precio, p.moneda AS plan_moneda
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    WHERE s.alumno_id = _alumno_id
  ),
  origen AS (
    SELECT
      s.id AS sid,
      ph.id AS ph_id,
      COALESCE(ph.fecha_vigencia, ph.fecha_cambio::date) AS ph_vigencia,
      ph.fecha_cambio,
      ph.aplicado_at,
      ph.aplicar_a,
      ph.modificado_por,
      ph.precio_nuevo
    FROM subs s
    LEFT JOIN LATERAL (
      SELECT h.*
      FROM public.precio_historial h
      WHERE h.plan_id = s.plan_id
        AND COALESCE(h.fecha_vigencia, h.fecha_cambio::date) <= s.fecha_inicio
      ORDER BY COALESCE(h.fecha_vigencia, h.fecha_cambio::date) DESC, h.fecha_cambio DESC
      LIMIT 1
    ) ph ON true
  ),
  jobs AS (
    -- último cambio aplicado por plan y detección de reproceso fuera de orden
    SELECT
      h.plan_id,
      MAX(h.aplicado_at) AS ultimo_aplicado_at,
      (ARRAY_AGG(COALESCE(h.fecha_vigencia, h.fecha_cambio::date) ORDER BY h.aplicado_at DESC))[1] AS ultimo_vigencia,
      MAX(COALESCE(h.fecha_vigencia, h.fecha_cambio::date)) AS max_vigencia_aplicada
    FROM public.precio_historial h
    WHERE h.aplicado_at IS NOT NULL
    GROUP BY h.plan_id
  )
  SELECT
    s.id,
    s.plan_id,
    s.plan_nombre,
    s.estado,
    s.fecha_inicio,
    s.fecha_fin,
    s.plan_moneda,
    s.precio_base,
    s.precio_final,
    s.plan_precio,
    o.precio_nuevo,
    (s.precio_base - o.precio_nuevo),
    o.ph_id,
    o.ph_vigencia,
    o.fecha_cambio,
    o.aplicado_at,
    o.aplicar_a,
    o.modificado_por,
    s.updated_at,
    j.ultimo_aplicado_at,
    j.ultimo_vigencia,
    COALESCE(j.ultimo_vigencia < j.max_vigencia_aplicada, false),
    COALESCE(o.aplicado_at IS NOT NULL AND o.aplicado_at::date < o.ph_vigencia, false),
    COALESCE(o.precio_nuevo IS NOT NULL AND s.precio_base IS DISTINCT FROM o.precio_nuevo, false),
    CASE
      WHEN o.ph_id IS NULL THEN 'Sin historial de precio previo al período'
      WHEN o.aplicado_at IS NOT NULL AND o.aplicado_at::date < o.ph_vigencia
        THEN 'Cambio aplicado antes de su fecha de vigencia'
      WHEN j.ultimo_vigencia < j.max_vigencia_aplicada
        THEN 'Reproceso fuera de orden: el último cambio aplicado tiene vigencia anterior a otro ya aplicado'
      WHEN s.precio_base IS DISTINCT FROM o.precio_nuevo
        THEN 'Precio desalineado respecto del historial vigente'
      ELSE 'OK'
    END
  FROM subs s
  LEFT JOIN origen o ON o.sid = s.id
  LEFT JOIN jobs j ON j.plan_id = s.plan_id
  ORDER BY s.fecha_inicio DESC;
$function$;

REVOKE ALL ON FUNCTION public.audit_alumno_precios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_alumno_precios(uuid) TO authenticated, service_role;