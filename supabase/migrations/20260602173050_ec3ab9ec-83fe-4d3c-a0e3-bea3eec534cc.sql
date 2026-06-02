CREATE OR REPLACE VIEW public.vw_pagos_por_cobrar AS
SELECT
  'suscripcion'::text                            AS source,
  s.id                                           AS item_id,
  s.alumno_id                                    AS alumno_id,
  a.nombre                                       AS alumno_nombre,
  a.telefono                                     AS alumno_telefono,
  p.nombre                                       AS concepto,
  COALESCE(s.precio_final, p.precio, 0)::numeric AS amount,
  COALESCE(p.moneda, 'ARS')                      AS currency,
  s.fecha_fin                                    AS due_date,
  CASE
    WHEN s.estado = 'pendiente' THEN 'pendiente'
    WHEN s.estado = 'activa' AND s.fecha_fin < CURRENT_DATE
         AND date_trunc('month', CURRENT_DATE::timestamp)
             = date_trunc('month', (s.fecha_fin + INTERVAL '1 day')::timestamp)
         AND EXTRACT(DAY FROM CURRENT_DATE) <= 5
      THEN 'pago_pendiente'
    WHEN s.estado = 'activa' AND s.fecha_fin < CURRENT_DATE THEN 'acceso_pausado'
    WHEN s.estado = 'vencida' THEN 'vencida'
    ELSE s.estado
  END                                            AS effective_status,
  s.created_at                                   AS created_at
FROM public.suscripciones s
LEFT JOIN public.alumnos a ON a.id = s.alumno_id
LEFT JOIN public.planes  p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL
  AND s.estado <> 'cancelada'
  AND s.estado <> 'pausa'
  AND (
    s.estado IN ('pendiente','vencida')
    OR (s.estado = 'activa' AND s.fecha_fin < CURRENT_DATE)
  )

UNION ALL

SELECT
  'cuota_evento'::text                           AS source,
  ri.id                                          AS item_id,
  er.alumno_id                                   AS alumno_id,
  a.nombre                                       AS alumno_nombre,
  a.telefono                                     AS alumno_telefono,
  COALESCE(e.title, ri.label)                    AS concepto,
  ri.balance_due::numeric                        AS amount,
  ri.currency                                    AS currency,
  ri.due_date                                    AS due_date,
  CASE
    WHEN ri.due_date IS NOT NULL AND ri.due_date < CURRENT_DATE THEN 'vencida'
    ELSE 'pendiente'
  END                                            AS effective_status,
  ri.created_at                                  AS created_at
FROM public.reservation_installments ri
JOIN public.event_reservations er ON er.id = ri.reservation_id
LEFT JOIN public.alumnos a ON a.id = er.alumno_id
LEFT JOIN public.events   e ON e.id = er.event_id
WHERE ri.status IN ('pendiente','parcial')
  AND ri.balance_due > 0
  AND er.cancelled_at IS NULL;

GRANT SELECT ON public.vw_pagos_por_cobrar TO authenticated, service_role;

COMMENT ON VIEW public.vw_pagos_por_cobrar IS
'Vista unificada de pagos por cobrar: suscripciones pendientes/vencidas + cuotas de eventos con saldo. effective_status sigue la misma lógica que src/lib/subscriptionStatus.ts (gracia día 1-5 → pago_pendiente; >5 → acceso_pausado).';