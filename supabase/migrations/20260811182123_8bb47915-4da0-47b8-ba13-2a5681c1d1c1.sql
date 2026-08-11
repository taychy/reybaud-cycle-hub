CREATE MATERIALIZED VIEW public.mv_backfill_ingresos AS SELECT * FROM public.vw_backfill_ingresos;
CREATE UNIQUE INDEX ON public.mv_backfill_ingresos (pago_origen_tipo, pago_origen_id);
CREATE INDEX ON public.mv_backfill_ingresos (alumno_id, moneda_pago, fecha_pago);
CREATE INDEX ON public.mv_backfill_ingresos (mp_payment_id);

CREATE MATERIALIZED VIEW public.mv_backfill_obligaciones AS
SELECT o.*, greatest(coalesce(o.monto_obligacion,0) - coalesce(o.pagado_legacy,0), 0) AS saldo_legacy
FROM public.vw_backfill_obligaciones o;
CREATE UNIQUE INDEX ON public.mv_backfill_obligaciones (obligacion_tipo, obligacion_id);
CREATE INDEX ON public.mv_backfill_obligaciones (alumno_id, moneda, fecha_obligacion);

CREATE OR REPLACE VIEW public.vw_backfill_candidatos AS
WITH ing AS (SELECT * FROM public.mv_backfill_ingresos),
obl AS (SELECT * FROM public.mv_backfill_obligaciones),
p1 AS (
  SELECT i.pago_origen_tipo, i.pago_origen_id, o.obligacion_tipo, o.obligacion_id,
         1 AS prioridad, 'VINCULO_EXPLICITO_ID'::text AS criterio_match,
         jsonb_build_object('regla','mp_account_movements.suscripcion_id') AS meta
  FROM ing i JOIN obl o ON o.obligacion_tipo='suscripcion'
        AND o.obligacion_id = nullif(i.evidencia->>'suscripcion_id','')::uuid
  WHERE i.pago_origen_tipo='mp_movimiento'
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'reservation_installment', ri.id, 1, 'VINCULO_EXPLICITO_ID',
         jsonb_build_object('regla','mp.reservation_payment_id -> installment')
  FROM ing i
  JOIN public.reservation_payments rp ON rp.id = nullif(i.evidencia->>'reservation_payment_id','')::uuid
  JOIN public.reservation_installments ri ON ri.id = rp.installment_id
  WHERE i.pago_origen_tipo='mp_movimiento'
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'suscripcion', o.obligacion_id, 1, 'VINCULO_EXPLICITO_ID',
         jsonb_build_object('regla','mp_payment_id = suscripciones.mp_payment_id')
  FROM ing i JOIN obl o ON o.obligacion_tipo='suscripcion'
        AND (o.evidencia->>'mp_payment_id') = i.mp_payment_id
  WHERE i.pago_origen_tipo='mp_movimiento' AND i.mp_payment_id IS NOT NULL
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'store_order', so.id, 1, 'VINCULO_EXPLICITO_ID',
         jsonb_build_object('regla','mp_payment_id = store_orders.mp_payment_id')
  FROM ing i JOIN public.store_orders so ON so.mp_payment_id = i.mp_payment_id
  WHERE i.pago_origen_tipo='mp_movimiento' AND i.mp_payment_id IS NOT NULL
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'reservation_installment', ri.id, 1, 'VINCULO_EXPLICITO_ID',
         jsonb_build_object('regla','mp_payment_id = reservation_payments.mp_payment_id')
  FROM ing i JOIN public.reservation_payments rp ON rp.mp_payment_id = i.mp_payment_id AND rp.anulado_at IS NULL
  JOIN public.reservation_installments ri ON ri.id = rp.installment_id
  WHERE i.pago_origen_tipo='mp_movimiento' AND i.mp_payment_id IS NOT NULL
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'suscripcion', i.pago_origen_id, 1, 'VINCULO_ESTRUCTURAL_PROPIO',
         jsonb_build_object('regla','suscripcion pagada fuera de MP')
  FROM ing i WHERE i.pago_origen_tipo='suscripcion_directa'
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'reservation_installment',
         nullif(i.evidencia->>'installment_id','')::uuid, 1, 'VINCULO_ESTRUCTURAL_PROPIO',
         jsonb_build_object('regla','reservation_payment.installment_id')
  FROM ing i WHERE i.pago_origen_tipo='reservation_payment' AND nullif(i.evidencia->>'installment_id','') IS NOT NULL
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'event_reservation',
         nullif(i.evidencia->>'reservation_id','')::uuid, 1, 'VINCULO_ESTRUCTURAL_PROPIO',
         jsonb_build_object('regla','reservation_payment.reservation_id (sin cuotas)')
  FROM ing i
  WHERE i.pago_origen_tipo='reservation_payment' AND nullif(i.evidencia->>'installment_id','') IS NULL
    AND EXISTS (SELECT 1 FROM obl o WHERE o.obligacion_tipo='event_reservation'
                  AND o.obligacion_id = nullif(i.evidencia->>'reservation_id','')::uuid)
  UNION ALL
  SELECT i.pago_origen_tipo, i.pago_origen_id, 'store_order', i.pago_origen_id, 1, 'VINCULO_ESTRUCTURAL_PROPIO',
         jsonb_build_object('regla','store_order pagado')
  FROM ing i WHERE i.pago_origen_tipo='store_order'
),
p2 AS (
  SELECT i.pago_origen_tipo, i.pago_origen_id,
         CASE i.evidencia->>'aplicado_a_fuente_tabla'
           WHEN 'suscripciones' THEN 'suscripcion'
           WHEN 'reservation_installments' THEN 'reservation_installment'
           WHEN 'event_reservations' THEN 'event_reservation'
           WHEN 'store_orders' THEN 'store_order'
           WHEN 'cuenta_ajustes' THEN 'cuenta_ajuste_cargo'
           ELSE NULL END,
         nullif(i.evidencia->>'aplicado_a_fuente_id','')::uuid, 2, 'REFERENCIA_EXTERNA_EXPLICITA',
         jsonb_build_object('regla','cuenta_ajustes.aplicado_a_fuente_*')
  FROM ing i
  WHERE i.pago_origen_tipo='cuenta_ajuste_credito'
    AND nullif(i.evidencia->>'aplicado_a_fuente_id','') IS NOT NULL
),
p3 AS (
  SELECT pi.pago_origen_tipo, pi.pago_origen_id, pi.obligacion_tipo, pi.obligacion_id, 3,
         'IMPUTACION_EXPLICITA_EXISTENTE',
         jsonb_build_object('regla','pagos_imputaciones vigente')
  FROM public.pagos_imputaciones pi WHERE pi.anulado_at IS NULL
),
ya AS (
  SELECT pago_origen_id FROM p1 UNION SELECT pago_origen_id FROM p2 UNION SELECT pago_origen_id FROM p3
),
p45 AS (
  SELECT i.pago_origen_tipo, i.pago_origen_id, o.obligacion_tipo, o.obligacion_id,
         CASE WHEN abs(i.monto_pago - o.saldo_legacy) <= 0.01 THEN 4 ELSE 5 END,
         CASE WHEN abs(i.monto_pago - o.saldo_legacy) <= 0.01
              THEN 'COINCIDENCIA_EXACTA_ALUMNO_MONEDA_IMPORTE_FECHA'
              ELSE 'COINCIDENCIA_APROXIMADA_CONTEXTUAL' END,
         jsonb_build_object('regla','alumno+moneda+ventana 45d','diferencia', round(i.monto_pago - o.saldo_legacy, 2))
  FROM ing i
  JOIN obl o ON o.alumno_id = i.alumno_id AND o.moneda = i.moneda_pago AND o.saldo_legacy > 0.01
  WHERE i.alumno_id IS NOT NULL
    AND o.fecha_obligacion BETWEEN i.fecha_pago - 45 AND i.fecha_pago + 45
    AND NOT EXISTS (SELECT 1 FROM ya WHERE ya.pago_origen_id = i.pago_origen_id)
),
todos AS (
  SELECT * FROM p1 UNION ALL SELECT * FROM p2 UNION ALL SELECT * FROM p3 UNION ALL SELECT * FROM p45
),
dedup AS (
  SELECT DISTINCT ON (pago_origen_id, obligacion_tipo, obligacion_id)
         pago_origen_tipo, pago_origen_id, obligacion_tipo, obligacion_id, prioridad, criterio_match, meta
  FROM todos WHERE obligacion_id IS NOT NULL AND obligacion_tipo IS NOT NULL
  ORDER BY pago_origen_id, obligacion_tipo, obligacion_id, prioridad
)
SELECT d.*,
       count(*) OVER (PARTITION BY d.pago_origen_id) AS candidatos_del_pago,
       min(d.prioridad) OVER (PARTITION BY d.pago_origen_id) AS mejor_prioridad_del_pago
FROM dedup d;

CREATE MATERIALIZED VIEW public.mv_backfill_candidatos AS SELECT * FROM public.vw_backfill_candidatos;
CREATE UNIQUE INDEX ON public.mv_backfill_candidatos (pago_origen_id, obligacion_tipo, obligacion_id);

CREATE OR REPLACE VIEW public.vw_pagos_imputaciones_backfill_preview AS
WITH ing AS (SELECT * FROM public.mv_backfill_ingresos),
obl AS (SELECT * FROM public.mv_backfill_obligaciones),
cand AS (SELECT * FROM public.mv_backfill_candidatos),
base AS (
  SELECT i.pago_origen_tipo, i.pago_origen_id, i.mp_payment_id, i.fecha_pago,
         coalesce(i.alumno_id, o.alumno_id) AS alumno_id,
         i.monto_pago, i.moneda_pago,
         c.obligacion_tipo, c.obligacion_id, o.periodo AS periodo_obligacion,
         o.monto_obligacion, o.pagado_legacy, o.saldo_legacy,
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
         THEN least(o.monto_pago, o.saldo_legacy) ELSE 0 END AS monto_tentativo
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
  a.monto_obligacion, a.pagado_legacy, a.saldo_legacy,
  round(greatest(least(a.monto_tentativo, a.monto_pago - a.consumido_pago_antes,
      a.saldo_legacy - a.consumido_obl_antes), 0), 2) AS monto_propuesto_imputar,
  round(a.monto_pago - a.consumido_pago_antes, 2) AS saldo_pago_antes,
  round(a.monto_pago - a.consumido_pago_antes - greatest(least(a.monto_tentativo,
      a.monto_pago - a.consumido_pago_antes, a.saldo_legacy - a.consumido_obl_antes),0), 2) AS saldo_pago_despues,
  round(a.saldo_legacy - a.consumido_obl_antes, 2) AS saldo_obligacion_antes,
  round(a.saldo_legacy - a.consumido_obl_antes - greatest(least(a.monto_tentativo,
      a.monto_pago - a.consumido_pago_antes, a.saldo_legacy - a.consumido_obl_antes),0), 2) AS saldo_obligacion_despues,
  a.criterio_match, a.nivel_confianza,
  (a.nivel_confianza = 'REQUIERE_REVISION') AS requiere_revision,
  a.motivo_revision,
  jsonb_build_object(
    'reglas_aplicadas', a.meta, 'prioridad', a.prioridad,
    'candidatos_del_pago', a.candidatos_del_pago, 'orden_pago', a.orden_pago,
    'orden_obligacion', a.orden_obligacion, 'evidencia_ingreso', a.evidencia,
    'diferencia_pago_vs_saldo', round(a.monto_pago - a.saldo_legacy, 2)
  ) AS metadata
FROM alocado a
LEFT JOIN public.alumnos al ON al.id = a.alumno_id
UNION ALL
SELECT i.pago_origen_tipo, i.pago_origen_id, i.mp_payment_id, i.fecha_pago, i.alumno_id,
       trim(coalesce(al.nombre,'') || ' ' || coalesce(al.apellido,'')),
       i.monto_pago, i.moneda_pago, NULL, NULL, NULL, NULL, NULL, NULL,
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

CREATE OR REPLACE FUNCTION public.refresh_backfill_preview()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_backfill_ingresos;
  REFRESH MATERIALIZED VIEW public.mv_backfill_obligaciones;
  REFRESH MATERIALIZED VIEW public.mv_backfill_candidatos;
  REFRESH MATERIALIZED VIEW public.mv_backfill_preview;
  RETURN 'ok';
END $$;

GRANT SELECT ON public.mv_backfill_ingresos, public.mv_backfill_obligaciones,
  public.mv_backfill_candidatos, public.mv_backfill_preview TO authenticated;
GRANT ALL ON public.mv_backfill_ingresos, public.mv_backfill_obligaciones,
  public.mv_backfill_candidatos, public.mv_backfill_preview TO service_role;