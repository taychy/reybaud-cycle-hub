DROP VIEW IF EXISTS public.vw_backfill_sobreimputacion;
DROP VIEW IF EXISTS public.vw_backfill_saldos_comparacion;
DROP VIEW IF EXISTS public.vw_backfill_resumen;
DROP MATERIALIZED VIEW IF EXISTS public.mv_backfill_preview;
DROP VIEW IF EXISTS public.vw_pagos_imputaciones_backfill_preview;

CREATE VIEW public.vw_pagos_imputaciones_backfill_preview AS
WITH ing AS (SELECT * FROM public.mv_backfill_ingresos),
obl AS (SELECT * FROM public.mv_backfill_obligaciones),
cand AS (SELECT * FROM public.mv_backfill_candidatos),
base AS (
  SELECT i.pago_origen_tipo, i.pago_origen_id, i.mp_payment_id, i.fecha_pago,
         coalesce(i.alumno_id, o.alumno_id) AS alumno_id,
         i.monto_pago, i.moneda_pago,
         c.obligacion_tipo, c.obligacion_id, o.periodo AS periodo_obligacion,
         o.monto_obligacion, o.pagado_legacy, o.saldo_legacy,
         CASE WHEN c.prioridad <= 3 THEN o.monto_obligacion ELSE o.saldo_legacy END AS capacidad_obligacion,
         c.prioridad, c.criterio_match, c.candidatos_del_pago, c.mejor_prioridad_del_pago,
         c.meta, i.evidencia
  FROM ing i
  JOIN cand c ON c.pago_origen_id = i.pago_origen_id
  JOIN obl o ON o.obligacion_tipo = c.obligacion_tipo AND o.obligacion_id = c.obligacion_id
),
clasif AS (
  SELECT b.*,
    CASE
      WHEN b.prioridad <= 3 THEN 'DETERMINISTICO'
      WHEN b.prioridad = 4 AND b.candidatos_del_pago = 1 THEN 'ALTA_CONFIANZA'
      ELSE 'REQUIERE_REVISION'
    END AS nivel_confianza,
    CASE
      WHEN b.prioridad <= 3 THEN NULL
      WHEN b.prioridad = 4 AND b.candidatos_del_pago = 1 THEN NULL
      WHEN b.prioridad = 4 AND b.candidatos_del_pago > 1 THEN 'Varias obligaciones compatibles con el mismo importe'
      WHEN b.monto_pago > b.saldo_legacy THEN 'Pago mayor a la obligación candidata (posible excedente o split)'
      WHEN b.monto_pago < b.saldo_legacy THEN 'Pago menor a la obligación candidata (posible pago parcial)'
      ELSE 'Evidencia contextual insuficiente'
    END AS motivo_revision
  FROM base b
),
orden AS (
  SELECT c.*,
    row_number() OVER (PARTITION BY c.pago_origen_id
      ORDER BY c.prioridad, c.periodo_obligacion NULLS LAST, c.obligacion_id) AS orden_pago,
    row_number() OVER (PARTITION BY c.obligacion_tipo, c.obligacion_id
      ORDER BY c.fecha_pago, c.pago_origen_id) AS orden_obligacion
  FROM clasif c
),
tentativo AS (
  SELECT o.*,
    CASE WHEN o.nivel_confianza IN ('DETERMINISTICO','ALTA_CONFIANZA')
         THEN least(o.monto_pago, o.capacidad_obligacion) ELSE 0 END AS monto_tentativo
  FROM orden o
),
alocado AS (
  SELECT t.*,
    coalesce(sum(t.monto_tentativo) OVER (PARTITION BY t.pago_origen_id ORDER BY t.orden_pago
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS consumido_pago_antes,
    coalesce(sum(t.monto_tentativo) OVER (PARTITION BY t.obligacion_tipo, t.obligacion_id ORDER BY t.orden_obligacion
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS consumido_obl_antes
  FROM tentativo t
)
SELECT
  a.pago_origen_tipo, a.pago_origen_id, a.mp_payment_id, a.fecha_pago, a.alumno_id,
  trim(coalesce(al.nombre,'') || ' ' || coalesce(al.apellido,'')) AS alumno_nombre,
  a.monto_pago, a.moneda_pago, a.obligacion_tipo, a.obligacion_id, a.periodo_obligacion,
  a.monto_obligacion, a.pagado_legacy, a.saldo_legacy, a.capacidad_obligacion,
  round(greatest(least(a.monto_tentativo, a.monto_pago - a.consumido_pago_antes,
      a.capacidad_obligacion - a.consumido_obl_antes), 0), 2) AS monto_propuesto_imputar,
  round(a.monto_pago - a.consumido_pago_antes, 2) AS saldo_pago_antes,
  round(a.monto_pago - a.consumido_pago_antes - greatest(least(a.monto_tentativo,
      a.monto_pago - a.consumido_pago_antes, a.capacidad_obligacion - a.consumido_obl_antes),0), 2) AS saldo_pago_despues,
  round(a.capacidad_obligacion - a.consumido_obl_antes, 2) AS saldo_obligacion_antes,
  round(a.capacidad_obligacion - a.consumido_obl_antes - greatest(least(a.monto_tentativo,
      a.monto_pago - a.consumido_pago_antes, a.capacidad_obligacion - a.consumido_obl_antes),0), 2) AS saldo_obligacion_despues,
  a.criterio_match, a.nivel_confianza,
  (a.nivel_confianza = 'REQUIERE_REVISION') AS requiere_revision,
  a.motivo_revision,
  jsonb_build_object(
    'reglas_aplicadas', a.meta, 'prioridad', a.prioridad,
    'candidatos_del_pago', a.candidatos_del_pago, 'orden_pago', a.orden_pago,
    'orden_obligacion', a.orden_obligacion, 'evidencia_ingreso', a.evidencia,
    'diferencia_pago_vs_capacidad', round(a.monto_pago - a.capacidad_obligacion, 2)
  ) AS metadata
FROM alocado a
LEFT JOIN public.alumnos al ON al.id = a.alumno_id
UNION ALL
SELECT i.pago_origen_tipo, i.pago_origen_id, i.mp_payment_id, i.fecha_pago, i.alumno_id,
       trim(coalesce(al.nombre,'') || ' ' || coalesce(al.apellido,'')),
       i.monto_pago, i.moneda_pago, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       0, i.monto_pago, i.monto_pago, NULL, NULL,
       'SIN_EVIDENCIA'::text, 'NO_CLASIFICABLE'::text, true,
       CASE WHEN i.alumno_id IS NULL THEN 'Pago sin alumno identificado'
            ELSE 'Alumno identificado pero sin obligación compatible abierta' END,
       jsonb_build_object('reglas_aplicadas','ninguna','evidencia_ingreso', i.evidencia)
FROM public.mv_backfill_ingresos i
LEFT JOIN public.alumnos al ON al.id = i.alumno_id
WHERE NOT EXISTS (SELECT 1 FROM public.mv_backfill_candidatos c WHERE c.pago_origen_id = i.pago_origen_id);

CREATE MATERIALIZED VIEW public.mv_backfill_preview AS
SELECT * FROM public.vw_pagos_imputaciones_backfill_preview;
CREATE INDEX ON public.mv_backfill_preview (alumno_id);
CREATE INDEX ON public.mv_backfill_preview (nivel_confianza);
CREATE INDEX ON public.mv_backfill_preview (pago_origen_id);

CREATE VIEW public.vw_backfill_sobreimputacion AS
SELECT 'BACKFILL_SOBREIMPUTACION_PAGO'::text AS tipo, 'CRITICA'::text AS severidad,
       p.pago_origen_tipo AS entidad_tipo, p.pago_origen_id AS entidad_id,
       max(p.monto_pago) AS tope, round(sum(p.monto_propuesto_imputar),2) AS propuesto,
       round(sum(p.monto_propuesto_imputar) - max(p.monto_pago),2) AS exceso
FROM public.mv_backfill_preview p
WHERE p.obligacion_id IS NOT NULL
GROUP BY 1,2,3,4 HAVING sum(p.monto_propuesto_imputar) - max(p.monto_pago) > 0.01
UNION ALL
SELECT 'BACKFILL_SOBREIMPUTACION_OBLIGACION', 'CRITICA',
       p.obligacion_tipo, p.obligacion_id,
       max(p.capacidad_obligacion), round(sum(p.monto_propuesto_imputar),2),
       round(sum(p.monto_propuesto_imputar) - max(p.capacidad_obligacion),2)
FROM public.mv_backfill_preview p
WHERE p.obligacion_id IS NOT NULL
GROUP BY 1,2,3,4 HAVING sum(p.monto_propuesto_imputar) - max(p.capacidad_obligacion) > 0.01;

CREATE VIEW public.vw_backfill_saldos_comparacion AS
WITH legacy AS (
  SELECT alumno_id,
         round(sum(coalesce(debe,0)),2) AS cargos_legacy,
         round(sum(coalesce(haber,0)) FILTER (WHERE fuente_tabla <> 'cuenta_ajustes'),2) AS pagos_legacy,
         round(sum(coalesce(haber,0)) FILTER (WHERE fuente_tabla = 'cuenta_ajustes'),2) AS creditos_legacy,
         round(sum(coalesce(debe,0) - coalesce(haber,0)),2) AS saldo_legacy
  FROM public.vw_cuenta_corriente_movimientos GROUP BY 1
), oblig AS (
  SELECT alumno_id, round(sum(monto_obligacion),2) AS obligaciones_modelo_nuevo
  FROM public.mv_backfill_obligaciones WHERE alumno_id IS NOT NULL GROUP BY 1
), imput AS (
  SELECT alumno_id,
         round(sum(monto_propuesto_imputar),2) AS imputaciones_simuladas,
         round(sum(monto_pago_unico),2) AS ingresos_totales
  FROM (
    SELECT alumno_id, monto_propuesto_imputar,
           CASE WHEN row_number() OVER (PARTITION BY pago_origen_id ORDER BY obligacion_id NULLS FIRST) = 1
                THEN monto_pago ELSE 0 END AS monto_pago_unico
    FROM public.mv_backfill_preview WHERE alumno_id IS NOT NULL
  ) z GROUP BY 1
), calc AS (
  SELECT a.id AS alumno_id,
    trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,'')) AS alumno_nombre,
    coalesce(l.cargos_legacy,0) AS cargos_legacy,
    coalesce(l.pagos_legacy,0) AS pagos_legacy,
    coalesce(l.creditos_legacy,0) AS creditos_legacy,
    coalesce(l.saldo_legacy,0) AS saldo_legacy,
    coalesce(o.obligaciones_modelo_nuevo,0) AS obligaciones_modelo_nuevo,
    coalesce(i.imputaciones_simuladas,0) AS imputaciones_simuladas,
    round(coalesce(i.ingresos_totales,0) - coalesce(i.imputaciones_simuladas,0),2) AS saldo_disponible_pagos,
    round(coalesce(o.obligaciones_modelo_nuevo,0) - coalesce(i.imputaciones_simuladas,0)
          - (coalesce(i.ingresos_totales,0) - coalesce(i.imputaciones_simuladas,0)),2) AS saldo_modelo_nuevo_simulado
  FROM public.alumnos a
  LEFT JOIN legacy l ON l.alumno_id = a.id
  LEFT JOIN oblig o ON o.alumno_id = a.id
  LEFT JOIN imput i ON i.alumno_id = a.id
  WHERE l.alumno_id IS NOT NULL OR o.alumno_id IS NOT NULL OR i.alumno_id IS NOT NULL
)
SELECT c.*,
  round(c.saldo_legacy - c.saldo_modelo_nuevo_simulado, 2) AS diferencia,
  CASE
    WHEN abs(c.saldo_legacy - c.saldo_modelo_nuevo_simulado) <= 0.01 THEN 'COINCIDE'
    WHEN abs(c.saldo_legacy - c.saldo_modelo_nuevo_simulado) <= 1 THEN 'DIFERENCIA_REDONDEO'
    WHEN EXISTS (SELECT 1 FROM public.mv_backfill_preview p
                  WHERE p.alumno_id = c.alumno_id AND p.nivel_confianza='REQUIERE_REVISION') THEN 'MATCH_AMBIGUO'
    WHEN EXISTS (SELECT 1 FROM public.mv_backfill_preview p
                  WHERE p.alumno_id = c.alumno_id AND p.nivel_confianza='NO_CLASIFICABLE') THEN 'PAGO_SIN_IMPUTAR'
    WHEN c.creditos_legacy > 0 THEN 'CREDITO_DUPLICADO'
    ELSE 'OTRO'
  END AS clasificacion_diferencia
FROM calc c;

CREATE VIEW public.vw_backfill_resumen AS
SELECT nivel_confianza,
       count(*) FILTER (WHERE obligacion_id IS NOT NULL) AS imputaciones_propuestas,
       count(DISTINCT pago_origen_id) AS pagos,
       count(DISTINCT alumno_id) AS alumnos,
       round(sum(monto_propuesto_imputar),2) AS monto_propuesto
FROM public.mv_backfill_preview GROUP BY 1;

CREATE OR REPLACE FUNCTION public.refresh_backfill_preview()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_backfill_ingresos;
  REFRESH MATERIALIZED VIEW public.mv_backfill_obligaciones;
  REFRESH MATERIALIZED VIEW public.mv_backfill_candidatos;
  REFRESH MATERIALIZED VIEW public.mv_backfill_preview;
  RETURN 'ok';
END $$;

GRANT SELECT ON public.vw_pagos_imputaciones_backfill_preview, public.mv_backfill_preview,
  public.vw_backfill_sobreimputacion, public.vw_backfill_saldos_comparacion,
  public.vw_backfill_resumen TO authenticated;
GRANT ALL ON public.vw_pagos_imputaciones_backfill_preview, public.mv_backfill_preview,
  public.vw_backfill_sobreimputacion, public.vw_backfill_saldos_comparacion,
  public.vw_backfill_resumen TO service_role;