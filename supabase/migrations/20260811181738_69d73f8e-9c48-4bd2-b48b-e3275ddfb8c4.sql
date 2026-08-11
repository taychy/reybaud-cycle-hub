-- ============================================================
-- FASE 3 — SIMULACIÓN Y CLASIFICACIÓN DEL BACKFILL HISTÓRICO
-- Capa 100% READ-ONLY.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_backfill_ingresos AS
SELECT 'mp_movimiento'::text AS pago_origen_tipo, m.id AS pago_origen_id, m.mp_payment_id,
       m.fecha_movimiento::date AS fecha_pago, m.alumno_id,
       coalesce(m.amount,0)::numeric AS monto_pago, coalesce(m.currency,'ARS') AS moneda_pago,
       jsonb_build_object('status',m.status,'payer_email',m.payer_email,'payer_name',m.payer_name,
         'payer_document',m.payer_document,'external_reference',m.external_reference,
         'suscripcion_id',m.suscripcion_id,'reservation_payment_id',m.reservation_payment_id,
         'assigned_manually',m.assigned_manually) AS evidencia
FROM public.mp_account_movements m
WHERE m.direccion = 'ingreso' AND m.status = 'approved' AND m.gasto_id IS NULL
UNION ALL
SELECT 'suscripcion_directa', s.id, NULL, coalesce(s.fecha_inicio, s.created_at::date), s.alumno_id,
       coalesce(s.precio_final, s.precio_base, 0), coalesce(pl.moneda,'ARS'),
       jsonb_build_object('metodo_pago',s.metodo_pago,'origen_registro',s.origen_registro,
         'chequeado_admin',s.chequeado_admin,'estado',s.estado)
FROM public.suscripciones s LEFT JOIN public.planes pl ON pl.id = s.plan_id
WHERE public.is_subscription_paid(s.id)
  AND coalesce(s.mp_payment_id,'') = ''
  AND coalesce(s.metodo_pago,'') <> 'saldo_a_favor'
  AND coalesce(s.precio_final, s.precio_base, 0) > 0
UNION ALL
SELECT 'reservation_payment', rp.id, rp.mp_payment_id, rp.payment_date, rp.alumno_id,
       coalesce(rp.amount,0), coalesce(rp.currency,'ARS'),
       jsonb_build_object('status',rp.status,'payment_method',rp.payment_method,
         'payment_reference',rp.payment_reference,'installment_id',rp.installment_id,
         'reservation_id',rp.reservation_id)
FROM public.reservation_payments rp
WHERE rp.status = 'validado' AND rp.anulado_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.mp_account_movements m
                  WHERE m.direccion='ingreso' AND m.status='approved'
                    AND (m.reservation_payment_id = rp.id
                         OR (rp.mp_payment_id IS NOT NULL AND m.mp_payment_id = rp.mp_payment_id)))
UNION ALL
SELECT 'store_order', o.id, o.mp_payment_id, o.pagado_at::date, o.alumno_id,
       coalesce(o.total,0), coalesce(o.currency,'ARS'),
       jsonb_build_object('status',o.status,'mp_status',o.mp_status,'metodo_pago',o.metodo_pago,
         'cancelled_at',o.cancelled_at)
FROM public.store_orders o
WHERE o.pagado_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.mp_account_movements m
                  WHERE m.direccion='ingreso' AND m.status='approved'
                    AND o.mp_payment_id IS NOT NULL AND m.mp_payment_id = o.mp_payment_id)
UNION ALL
SELECT 'cuenta_ajuste_credito', a.id, a.referencia_externa, a.fecha, a.alumno_id,
       coalesce(a.monto,0), coalesce(a.moneda,'ARS'),
       jsonb_build_object('medio_pago',a.medio_pago,'concepto',a.concepto,
         'aplicado_a_fuente_tabla',a.aplicado_a_fuente_tabla,'aplicado_a_fuente_id',a.aplicado_a_fuente_id,
         'referencia_externa',a.referencia_externa)
FROM public.cuenta_ajustes a
WHERE a.tipo = 'credito'
  AND NOT EXISTS (SELECT 1 FROM public.mp_account_movements m
                  WHERE m.status='approved' AND a.referencia_externa IS NOT NULL
                    AND m.mp_payment_id = a.referencia_externa);

CREATE OR REPLACE VIEW public.vw_backfill_obligaciones AS
SELECT 'suscripcion'::text AS obligacion_tipo, s.id AS obligacion_id, s.alumno_id,
       to_char(s.fecha_inicio,'YYYY-MM') AS periodo,
       coalesce(s.precio_final, s.precio_base, 0)::numeric AS monto_obligacion,
       coalesce(pl.moneda,'ARS') AS moneda, s.fecha_inicio AS fecha_obligacion,
       coalesce(public.subscription_paid_amount(s.id),0)::numeric AS pagado_legacy,
       jsonb_build_object('estado',s.estado,'metodo_pago',s.metodo_pago,'mp_payment_id',s.mp_payment_id,
         'mp_status',s.mp_status,'origen_registro',s.origen_registro,'chequeado_admin',s.chequeado_admin,
         'plan_id',s.plan_id,'precio_base',s.precio_base,'precio_final',s.precio_final) AS evidencia
FROM public.suscripciones s LEFT JOIN public.planes pl ON pl.id = s.plan_id
WHERE coalesce(s.precio_final, s.precio_base, 0) > 0 AND s.estado <> 'cancelada'
UNION ALL
SELECT 'reservation_installment', ri.id, r.alumno_id, to_char(ri.due_date,'YYYY-MM'),
       coalesce(ri.monto_original, ri.amount, 0), coalesce(ri.currency, r.currency_snapshot, 'ARS'), ri.due_date,
       coalesce(ri.monto_pagado, ri.paid_amount, 0),
       jsonb_build_object('status',ri.status,'reservation_id',ri.reservation_id,
         'installment_number',ri.installment_number,'condoned_at',ri.condoned_at)
FROM public.reservation_installments ri
JOIN public.event_reservations r ON r.id = ri.reservation_id
WHERE coalesce(r.reservation_status, r.estado) IS DISTINCT FROM 'cancelada'
  AND coalesce(ri.monto_original, ri.amount, 0) > 0
UNION ALL
SELECT 'event_reservation', r.id, r.alumno_id, to_char(r.created_at,'YYYY-MM'),
       coalesce(r.amount_total, r.monto, 0), coalesce(r.currency_snapshot, r.moneda, 'ARS'), r.created_at::date,
       coalesce(r.amount_paid,0),
       jsonb_build_object('reservation_status',r.reservation_status,'payment_status',r.payment_status,
         'event_id',r.event_id)
FROM public.event_reservations r
WHERE NOT EXISTS (SELECT 1 FROM public.reservation_installments ri WHERE ri.reservation_id = r.id)
  AND coalesce(r.amount_total, r.monto, 0) > 0
  AND coalesce(r.reservation_status, r.estado) IS DISTINCT FROM 'cancelada'
UNION ALL
SELECT 'store_order', o.id, o.alumno_id, to_char(o.created_at,'YYYY-MM'), coalesce(o.total,0),
       coalesce(o.currency,'ARS'), o.created_at::date,
       CASE WHEN o.pagado_at IS NOT NULL THEN coalesce(o.total,0) ELSE 0 END,
       jsonb_build_object('status',o.status,'mp_status',o.mp_status,'cancelled_at',o.cancelled_at,
         'pagado_at',o.pagado_at)
FROM public.store_orders o
WHERE coalesce(o.total,0) > 0
UNION ALL
SELECT 'cuenta_ajuste_cargo', a.id, a.alumno_id, to_char(a.fecha,'YYYY-MM'), coalesce(a.monto,0),
       coalesce(a.moneda,'ARS'), a.fecha, 0,
       jsonb_build_object('concepto',a.concepto,'notas',a.notas)
FROM public.cuenta_ajustes a
WHERE a.tipo = 'cargo';

CREATE OR REPLACE VIEW public.vw_backfill_candidatos AS
WITH ing AS (SELECT * FROM public.vw_backfill_ingresos),
obl AS (
  SELECT o.*, greatest(coalesce(o.monto_obligacion,0) - coalesce(o.pagado_legacy,0), 0) AS saldo_legacy
  FROM public.vw_backfill_obligaciones o
),
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
    AND NOT EXISTS (SELECT 1 FROM p1 WHERE p1.pago_origen_id = i.pago_origen_id)
    AND NOT EXISTS (SELECT 1 FROM p2 WHERE p2.pago_origen_id = i.pago_origen_id)
    AND NOT EXISTS (SELECT 1 FROM p3 WHERE p3.pago_origen_id = i.pago_origen_id)
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

CREATE OR REPLACE VIEW public.vw_pagos_imputaciones_backfill_preview AS
WITH ing AS (SELECT * FROM public.vw_backfill_ingresos),
obl AS (
  SELECT o.*, greatest(coalesce(o.monto_obligacion,0) - coalesce(o.pagado_legacy,0), 0) AS saldo_legacy
  FROM public.vw_backfill_obligaciones o
),
cand AS (SELECT * FROM public.vw_backfill_candidatos),
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
  a.pago_origen_tipo,
  a.pago_origen_id,
  a.mp_payment_id,
  a.fecha_pago,
  a.alumno_id,
  trim(coalesce(al.nombre,'') || ' ' || coalesce(al.apellido,'')) AS alumno_nombre,
  a.monto_pago,
  a.moneda_pago,
  a.obligacion_tipo,
  a.obligacion_id,
  a.periodo_obligacion,
  a.monto_obligacion,
  a.pagado_legacy,
  a.saldo_legacy,
  round(greatest(least(a.monto_tentativo, a.monto_pago - a.consumido_pago_antes,
      a.saldo_legacy - a.consumido_obl_antes), 0), 2) AS monto_propuesto_imputar,
  round(a.monto_pago - a.consumido_pago_antes, 2) AS saldo_pago_antes,
  round(a.monto_pago - a.consumido_pago_antes - greatest(least(a.monto_tentativo,
      a.monto_pago - a.consumido_pago_antes, a.saldo_legacy - a.consumido_obl_antes),0), 2) AS saldo_pago_despues,
  round(a.saldo_legacy - a.consumido_obl_antes, 2) AS saldo_obligacion_antes,
  round(a.saldo_legacy - a.consumido_obl_antes - greatest(least(a.monto_tentativo,
      a.monto_pago - a.consumido_pago_antes, a.saldo_legacy - a.consumido_obl_antes),0), 2) AS saldo_obligacion_despues,
  a.criterio_match,
  a.nivel_confianza,
  (a.nivel_confianza = 'REQUIERE_REVISION') AS requiere_revision,
  a.motivo_revision,
  jsonb_build_object(
    'reglas_aplicadas', a.meta,
    'prioridad', a.prioridad,
    'candidatos_del_pago', a.candidatos_del_pago,
    'orden_pago', a.orden_pago,
    'orden_obligacion', a.orden_obligacion,
    'evidencia_ingreso', a.evidencia,
    'diferencia_pago_vs_saldo', round(a.monto_pago - a.saldo_legacy, 2)
  ) AS metadata
FROM alocado a
LEFT JOIN public.alumnos al ON al.id = a.alumno_id
UNION ALL
SELECT i.pago_origen_tipo, i.pago_origen_id, i.mp_payment_id, i.fecha_pago, i.alumno_id,
       trim(coalesce(al.nombre,'') || ' ' || coalesce(al.apellido,'')),
       i.monto_pago, i.moneda_pago,
       NULL, NULL, NULL, NULL, NULL, NULL,
       0, i.monto_pago, i.monto_pago, NULL, NULL,
       'SIN_EVIDENCIA'::text, 'NO_CLASIFICABLE'::text, true,
       CASE WHEN i.alumno_id IS NULL THEN 'Pago sin alumno identificado'
            ELSE 'Alumno identificado pero sin obligación compatible abierta' END,
       jsonb_build_object('reglas_aplicadas','ninguna','evidencia_ingreso', i.evidencia)
FROM public.vw_backfill_ingresos i
LEFT JOIN public.alumnos al ON al.id = i.alumno_id
WHERE NOT EXISTS (SELECT 1 FROM public.vw_backfill_candidatos c WHERE c.pago_origen_id = i.pago_origen_id);

CREATE OR REPLACE VIEW public.vw_backfill_identidad_sugerida AS
WITH sin AS (
  SELECT * FROM public.vw_backfill_ingresos WHERE alumno_id IS NULL
), cand AS (
  SELECT s.pago_origen_tipo, s.pago_origen_id, s.mp_payment_id, s.fecha_pago, s.monto_pago, s.moneda_pago,
         a.id AS alumno_sugerido_id, trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,'')) AS alumno_sugerido,
         CASE
           WHEN lower(coalesce(s.evidencia->>'payer_email','')) = lower(a.email) THEN 'DETERMINISTICO'
           WHEN lower(coalesce(s.evidencia->>'payer_email','')) = ANY (SELECT lower(x) FROM unnest(a.emails_adicionales) x) THEN 'DETERMINISTICO'
           WHEN coalesce(s.evidencia->>'payer_document','') <> '' AND s.evidencia->>'payer_document' = a.documento THEN 'DETERMINISTICO'
           WHEN lower(coalesce(s.evidencia->>'payer_name','')) = lower(trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,''))) THEN 'ALTA_CONFIANZA'
           ELSE NULL END AS confianza_identidad,
         jsonb_build_object('payer_email',s.evidencia->>'payer_email','payer_name',s.evidencia->>'payer_name',
           'payer_document',s.evidencia->>'payer_document') AS evidencia
  FROM sin s JOIN public.alumnos a ON (
       lower(coalesce(s.evidencia->>'payer_email','~')) = lower(a.email)
    OR lower(coalesce(s.evidencia->>'payer_email','~')) = ANY (SELECT lower(x) FROM unnest(a.emails_adicionales) x)
    OR (coalesce(s.evidencia->>'payer_document','') <> '' AND s.evidencia->>'payer_document' = a.documento)
    OR lower(coalesce(s.evidencia->>'payer_name','~')) = lower(trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,'')))
  )
)
SELECT * FROM cand WHERE confianza_identidad IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_backfill_sobreimputacion AS
SELECT 'BACKFILL_SOBREIMPUTACION_PAGO'::text AS tipo, 'CRITICA'::text AS severidad,
       p.pago_origen_tipo AS entidad_tipo, p.pago_origen_id AS entidad_id,
       max(p.monto_pago) AS tope, round(sum(p.monto_propuesto_imputar),2) AS propuesto,
       round(sum(p.monto_propuesto_imputar) - max(p.monto_pago),2) AS exceso
FROM public.vw_pagos_imputaciones_backfill_preview p
WHERE p.obligacion_id IS NOT NULL
GROUP BY 1,2,3,4 HAVING sum(p.monto_propuesto_imputar) - max(p.monto_pago) > 0.01
UNION ALL
SELECT 'BACKFILL_SOBREIMPUTACION_OBLIGACION', 'CRITICA',
       p.obligacion_tipo, p.obligacion_id,
       max(p.saldo_legacy), round(sum(p.monto_propuesto_imputar),2),
       round(sum(p.monto_propuesto_imputar) - max(p.saldo_legacy),2)
FROM public.vw_pagos_imputaciones_backfill_preview p
WHERE p.obligacion_id IS NOT NULL
GROUP BY 1,2,3,4 HAVING sum(p.monto_propuesto_imputar) - max(p.saldo_legacy) > 0.01;

CREATE OR REPLACE VIEW public.vw_backfill_saldos_comparacion AS
WITH legacy AS (
  SELECT alumno_id,
         round(sum(coalesce(debe,0)),2) AS cargos_legacy,
         round(sum(coalesce(haber,0)) FILTER (WHERE fuente_tabla <> 'cuenta_ajustes'),2) AS pagos_legacy,
         round(sum(coalesce(haber,0)) FILTER (WHERE fuente_tabla = 'cuenta_ajustes'),2) AS creditos_legacy,
         round(sum(coalesce(debe,0) - coalesce(haber,0)),2) AS saldo_legacy
  FROM public.vw_cuenta_corriente_movimientos GROUP BY 1
), oblig AS (
  SELECT alumno_id, round(sum(monto_obligacion),2) AS obligaciones_modelo_nuevo
  FROM public.vw_backfill_obligaciones WHERE alumno_id IS NOT NULL GROUP BY 1
), imput AS (
  SELECT alumno_id,
         round(sum(monto_propuesto_imputar),2) AS imputaciones_simuladas,
         round(sum(monto_pago_unico),2) AS ingresos_totales
  FROM (
    SELECT alumno_id, monto_propuesto_imputar,
           CASE WHEN row_number() OVER (PARTITION BY pago_origen_id ORDER BY obligacion_id NULLS FIRST) = 1
                THEN monto_pago ELSE 0 END AS monto_pago_unico
    FROM public.vw_pagos_imputaciones_backfill_preview WHERE alumno_id IS NOT NULL
  ) z GROUP BY 1
)
SELECT
  a.id AS alumno_id,
  trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,'')) AS alumno_nombre,
  coalesce(l.cargos_legacy,0) AS cargos_legacy,
  coalesce(l.pagos_legacy,0) AS pagos_legacy,
  coalesce(l.creditos_legacy,0) AS creditos_legacy,
  coalesce(l.saldo_legacy,0) AS saldo_legacy,
  coalesce(o.obligaciones_modelo_nuevo,0) AS obligaciones_modelo_nuevo,
  coalesce(i.imputaciones_simuladas,0) AS imputaciones_simuladas,
  round(coalesce(i.ingresos_totales,0) - coalesce(i.imputaciones_simuladas,0),2) AS saldo_disponible_pagos,
  round(coalesce(o.obligaciones_modelo_nuevo,0) - coalesce(i.imputaciones_simuladas,0)
        - (coalesce(i.ingresos_totales,0) - coalesce(i.imputaciones_simuladas,0)),2) AS saldo_modelo_nuevo_simulado,
  round(coalesce(l.saldo_legacy,0) -
       (coalesce(o.obligaciones_modelo_nuevo,0) - coalesce(i.imputaciones_simuladas,0)
        - (coalesce(i.ingresos_totales,0) - coalesce(i.imputaciones_simuladas,0))),2) AS diferencia,
  CASE
    WHEN abs(coalesce(l.saldo_legacy,0) -
       (coalesce(o.obligaciones_modelo_nuevo,0) - coalesce(i.imputaciones_simuladas,0)
        - (coalesce(i.ingresos_totales,0) - coalesce(i.imputaciones_simuladas,0)))) <= 0.01 THEN 'COINCIDE'
    WHEN abs(coalesce(l.saldo_legacy,0) -
       (coalesce(o.obligaciones_modelo_nuevo,0) - coalesce(i.imputaciones_simuladas,0)
        - (coalesce(i.ingresos_totales,0) - coalesce(i.imputaciones_simuladas,0)))) <= 1 THEN 'DIFERENCIA_REDONDEO'
    WHEN EXISTS (SELECT 1 FROM public.vw_pagos_imputaciones_backfill_preview p
                  WHERE p.alumno_id = a.id AND p.nivel_confianza='REQUIERE_REVISION') THEN 'MATCH_AMBIGUO'
    WHEN EXISTS (SELECT 1 FROM public.vw_pagos_imputaciones_backfill_preview p
                  WHERE p.alumno_id = a.id AND p.nivel_confianza='NO_CLASIFICABLE') THEN 'PAGO_SIN_IMPUTAR'
    WHEN coalesce(l.creditos_legacy,0) > 0 THEN 'CREDITO_DUPLICADO'
    ELSE 'OTRO'
  END AS clasificacion_diferencia
FROM public.alumnos a
LEFT JOIN legacy l ON l.alumno_id = a.id
LEFT JOIN oblig o ON o.alumno_id = a.id
LEFT JOIN imput i ON i.alumno_id = a.id
WHERE l.alumno_id IS NOT NULL OR o.alumno_id IS NOT NULL OR i.alumno_id IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_backfill_resumen AS
SELECT nivel_confianza,
       count(*) FILTER (WHERE obligacion_id IS NOT NULL) AS imputaciones_propuestas,
       count(DISTINCT pago_origen_id) AS pagos,
       count(DISTINCT alumno_id) AS alumnos,
       round(sum(monto_propuesto_imputar),2) AS monto_propuesto
FROM public.vw_pagos_imputaciones_backfill_preview
GROUP BY 1;

GRANT SELECT ON public.vw_backfill_ingresos, public.vw_backfill_obligaciones,
  public.vw_backfill_candidatos, public.vw_pagos_imputaciones_backfill_preview,
  public.vw_backfill_identidad_sugerida, public.vw_backfill_sobreimputacion,
  public.vw_backfill_saldos_comparacion, public.vw_backfill_resumen TO authenticated;
GRANT ALL ON public.vw_backfill_ingresos, public.vw_backfill_obligaciones,
  public.vw_backfill_candidatos, public.vw_pagos_imputaciones_backfill_preview,
  public.vw_backfill_identidad_sugerida, public.vw_backfill_sobreimputacion,
  public.vw_backfill_saldos_comparacion, public.vw_backfill_resumen TO service_role;