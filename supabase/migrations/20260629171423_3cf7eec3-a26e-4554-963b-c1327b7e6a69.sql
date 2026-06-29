
CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
-- 1. Cargo de suscripción
SELECT s.alumno_id,
  COALESCE(s.fecha_inicio, s.created_at::date) AS fecha,
  'cargo_suscripcion'::text AS tipo,
  'Plan: ' || COALESCE(p.nombre, '—'::text) AS concepto,
  'suscripciones'::text AS fuente_tabla,
  s.id AS fuente_id,
  CASE
    WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente' THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
    ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0::numeric)
  END AS debe,
  0::numeric AS haber,
  COALESCE(p.moneda, 'ARS'::text) AS moneda,
  s.estado,
  jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre) AS referencia_extra
FROM suscripciones s
LEFT JOIN planes p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL AND s.estado <> 'cancelada'
UNION ALL
-- 2. Pago de suscripción
SELECT s.alumno_id,
  COALESCE(
    CASE WHEN s.origen_registro IN ('automatico','cargado_admin') THEN s.fecha_inicio ELSE NULL END,
    s.updated_at::date
  ) AS fecha,
  'pago_suscripcion'::text AS tipo,
  'Pago plan: ' || COALESCE(p.nombre, '—'::text) ||
    CASE WHEN s.metodo_pago IS NOT NULL THEN ' ('||s.metodo_pago||')' ELSE '' END AS concepto,
  'suscripciones'::text AS fuente_tabla,
  s.id AS fuente_id,
  0::numeric AS debe,
  COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric) AS haber,
  COALESCE(p.moneda, 'ARS'::text) AS moneda,
  s.estado,
  jsonb_build_object(
    'plan_id', s.plan_id,
    'plan_nombre', p.nombre,
    'metodo_pago', s.metodo_pago,
    'origen_registro', s.origen_registro,
    'mp_payment_id', s.mp_payment_id,
    'cuenta_mp_id', s.cuenta_mp_id,
    'notas', s.notas,
    'fecha_pago', s.fecha_inicio
  ) AS referencia_extra
FROM suscripciones s
LEFT JOIN planes p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL
  AND s.metodo_pago IS NOT NULL
  AND s.estado IN ('activa','pendiente_verificacion','vencida','conciliado')
  AND s.origen_registro IN ('automatico','cargado_admin')
UNION ALL
-- 3. Cargo de reserva
SELECT er.alumno_id,
  COALESCE(er.confirmed_at::date, er.created_at::date) AS fecha,
  'cargo_reserva'::text AS tipo,
  COALESCE(e.title, 'Evento') ||
    CASE WHEN er.package_nombre_snapshot IS NOT NULL THEN ' — '||er.package_nombre_snapshot ELSE '' END AS concepto,
  'event_reservations'::text AS fuente_tabla,
  er.id AS fuente_id,
  COALESCE(er.amount_total, er.price_snapshot, er.monto, 0::numeric) AS debe,
  0::numeric AS haber,
  COALESCE(er.currency_snapshot, er.moneda, e.currency, 'ARS'::text) AS moneda,
  er.reservation_status AS estado,
  jsonb_build_object('event_id', er.event_id, 'event_title', e.title, 'package_id', er.package_id, 'amount_total', er.amount_total, 'amount_paid', er.amount_paid, 'balance_due', er.balance_due, 'payment_plan_id', er.payment_plan_id) AS referencia_extra
FROM event_reservations er
LEFT JOIN events e ON e.id = er.event_id
WHERE er.alumno_id IS NOT NULL AND er.cancelled_at IS NULL AND COALESCE(er.reservation_status,'pendiente') <> 'cancelada'
UNION ALL
-- 4. Pago de reserva
SELECT rp.alumno_id,
  COALESCE(rp.payment_date, rp.created_at::date) AS fecha,
  'pago_reserva'::text AS tipo,
  'Pago '||COALESCE(e.title, 'Evento') ||
    CASE WHEN rp.payment_method IS NOT NULL THEN ' ('||rp.payment_method||')' ELSE '' END AS concepto,
  'reservation_payments'::text AS fuente_tabla,
  rp.id AS fuente_id,
  0::numeric AS debe,
  COALESCE(rp.equivalent_amount_event_currency, rp.amount, 0::numeric) AS haber,
  COALESCE(rp.event_currency, rp.currency, 'ARS'::text) AS moneda,
  rp.status AS estado,
  jsonb_build_object(
    'reservation_id', rp.reservation_id,
    'event_id', er.event_id,
    'event_title', e.title,
    'payment_method', rp.payment_method,
    'installment_id', rp.installment_id,
    'installment_number', rp.installment_number,
    'original_amount', rp.original_amount,
    'original_currency', rp.original_currency,
    'cuenta_mp_id', rp.cuenta_mp_id,
    'referencia_externa', rp.payment_reference,
    'comprobante_url', rp.proof_url,
    'notas', rp.notes,
    'fecha_pago', rp.payment_date
  ) AS referencia_extra
FROM reservation_payments rp
LEFT JOIN event_reservations er ON er.id = rp.reservation_id
LEFT JOIN events e ON e.id = er.event_id
WHERE rp.alumno_id IS NOT NULL AND rp.status = 'validado' AND rp.anulado_at IS NULL
UNION ALL
-- 5. Cargo de preventa
SELECT sp.alumno_id,
  sp.created_at::date AS fecha,
  'cargo_preventa'::text AS tipo,
  'Preventa: '||COALESCE(sp.producto_nombre,'—') AS concepto,
  'store_preorders'::text AS fuente_tabla,
  sp.id AS fuente_id,
  COALESCE(sp.precio_total, sp.precio_unitario * COALESCE(sp.cantidad,1)::numeric, 0::numeric) AS debe,
  0::numeric AS haber,
  COALESCE(sp.moneda,'ARS') AS moneda,
  sp.estado,
  jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'cantidad', sp.cantidad, 'variante', sp.variante, 'sena_monto', sp.sena_monto, 'saldo_pendiente', sp.saldo_pendiente, 'estado_pago_sena', sp.estado_pago_sena) AS referencia_extra
FROM store_preorders sp
WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL AND COALESCE(sp.estado,'') <> 'cancelada'
UNION ALL
-- 6. Pago seña preventa
SELECT sp.alumno_id,
  COALESCE(sp.sena_pagada_at::date, sp.updated_at::date) AS fecha,
  'pago_preventa'::text AS tipo,
  'Seña preventa: '||COALESCE(sp.producto_nombre,'—') ||
    CASE WHEN sp.forma_pago_sena IS NOT NULL THEN ' ('||sp.forma_pago_sena||')' ELSE '' END AS concepto,
  'store_preorders'::text AS fuente_tabla,
  sp.id AS fuente_id,
  0::numeric AS debe,
  COALESCE(sp.sena_monto, 0::numeric) AS haber,
  COALESCE(sp.moneda,'ARS') AS moneda,
  'sena_pagada'::text AS estado,
  jsonb_build_object(
    'product_id', sp.product_id,
    'producto_nombre', sp.producto_nombre,
    'forma_pago_sena', sp.forma_pago_sena,
    'mp_payment_id', sp.mp_payment_id,
    'cuenta_mp_id', sp.cuenta_mp_id,
    'notas', sp.notas,
    'fecha_pago', sp.sena_pagada_at,
    'tipo_pago', 'sena'
  ) AS referencia_extra
FROM store_preorders sp
WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL
  AND sp.estado_pago_sena IN ('pagado','aprobado','pagada','confirmada')
  AND COALESCE(sp.sena_monto,0) > 0
UNION ALL
-- 7. Saldo final preventa
SELECT sp.alumno_id,
  COALESCE(sp.entregada_at::date, sp.updated_at::date) AS fecha,
  'pago_preventa'::text AS tipo,
  'Saldo final preventa: '||COALESCE(sp.producto_nombre,'—') AS concepto,
  'store_preorders'::text AS fuente_tabla,
  sp.id AS fuente_id,
  0::numeric AS debe,
  GREATEST(COALESCE(sp.precio_total,0) - COALESCE(sp.sena_monto,0), 0::numeric) AS haber,
  COALESCE(sp.moneda,'ARS') AS moneda,
  COALESCE(sp.estado,'completada') AS estado,
  jsonb_build_object(
    'product_id', sp.product_id,
    'producto_nombre', sp.producto_nombre,
    'cuenta_mp_id', sp.cuenta_mp_id,
    'fecha_pago', sp.entregada_at,
    'tipo_pago', 'saldo_final'
  ) AS referencia_extra
FROM store_preorders sp
WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL
  AND COALESCE(sp.saldo_pendiente,0) <= 0
  AND COALESCE(sp.precio_total,0) > COALESCE(sp.sena_monto,0)
UNION ALL
-- 8. Cargo tienda
SELECT so.alumno_id,
  so.created_at::date AS fecha,
  'cargo_tienda'::text AS tipo,
  'Tienda — Orden #'||COALESCE(so.order_number::text, so.id::text) AS concepto,
  'store_orders'::text AS fuente_tabla,
  so.id AS fuente_id,
  COALESCE(so.total,0) AS debe,
  0::numeric AS haber,
  COALESCE(so.currency,'ARS') AS moneda,
  so.status AS estado,
  jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id) AS referencia_extra
FROM store_orders so
WHERE so.alumno_id IS NOT NULL AND COALESCE(so.status,'') <> 'cancelada'
UNION ALL
-- 9. Pago tienda
SELECT so.alumno_id,
  COALESCE(so.pagado_at::date, so.updated_at::date) AS fecha,
  'pago_tienda'::text AS tipo,
  'Pago tienda — Orden #'||COALESCE(so.order_number::text, so.id::text) ||
    CASE WHEN so.metodo_pago IS NOT NULL THEN ' ('||so.metodo_pago||')' ELSE '' END AS concepto,
  'store_orders'::text AS fuente_tabla,
  so.id AS fuente_id,
  0::numeric AS debe,
  COALESCE(so.total,0) AS haber,
  COALESCE(so.currency,'ARS') AS moneda,
  so.status AS estado,
  jsonb_build_object(
    'order_number', so.order_number,
    'metodo_pago', so.metodo_pago,
    'mp_payment_id', so.mp_payment_id,
    'cuenta_mp_id', so.cuenta_mp_id,
    'referencia_externa', so.mp_external_reference,
    'notas', so.notes,
    'fecha_pago', so.pagado_at
  ) AS referencia_extra
FROM store_orders so
WHERE so.alumno_id IS NOT NULL
  AND (so.pagado_at IS NOT NULL OR so.status IN ('pagada','pagado','completada','entregada'))
UNION ALL
-- 10. Ajuste cargo
SELECT ca.alumno_id, ca.fecha, 'ajuste_cargo'::text AS tipo,
  ca.concepto, 'cuenta_ajustes'::text AS fuente_tabla, ca.id AS fuente_id,
  ca.monto AS debe, 0::numeric AS haber, ca.moneda, 'registrado'::text AS estado,
  jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa) AS referencia_extra
FROM cuenta_ajustes ca
WHERE ca.tipo = 'cargo'
UNION ALL
-- 11. Ajuste crédito
SELECT ca.alumno_id, ca.fecha, 'ajuste_credito'::text AS tipo,
  ca.concepto, 'cuenta_ajustes'::text AS fuente_tabla, ca.id AS fuente_id,
  0::numeric AS debe, ca.monto AS haber, ca.moneda, 'registrado'::text AS estado,
  jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa) AS referencia_extra
FROM cuenta_ajustes ca
WHERE ca.tipo = 'credito';
