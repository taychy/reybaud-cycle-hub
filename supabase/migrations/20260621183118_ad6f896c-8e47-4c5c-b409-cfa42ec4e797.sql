CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
SELECT s.alumno_id, COALESCE(s.fecha_inicio, s.created_at::date) AS fecha, 'cargo_suscripcion'::text AS tipo,
  'Plan: '::text || COALESCE(p.nombre, '—'::text) AS concepto, 'suscripciones'::text AS fuente_tabla, s.id AS fuente_id,
  CASE WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente' THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0)
       ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0) END AS debe,
  0::numeric AS haber, COALESCE(p.moneda, 'ARS') AS moneda, s.estado,
  jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre) AS referencia_extra
FROM suscripciones s LEFT JOIN planes p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL AND s.estado <> 'cancelada'
UNION ALL
SELECT s.alumno_id,
  COALESCE(CASE WHEN s.origen_registro = ANY (ARRAY['automatico','cargado_admin']) THEN s.fecha_inicio END, s.updated_at::date) AS fecha,
  'pago_suscripcion', ('Pago plan: '::text || COALESCE(p.nombre,'—')) || CASE WHEN s.metodo_pago IS NOT NULL THEN ' ('||s.metodo_pago||')' ELSE '' END,
  'suscripciones', s.id, 0::numeric, COALESCE(s.precio_final, s.precio_base, p.precio, 0), COALESCE(p.moneda,'ARS'), s.estado,
  jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', s.metodo_pago, 'origen_registro', s.origen_registro, 'mp_payment_id', s.mp_payment_id)
FROM suscripciones s LEFT JOIN planes p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL AND s.metodo_pago IS NOT NULL
  AND s.estado = ANY (ARRAY['activa','pendiente_verificacion','vencida','conciliado'])
  AND s.origen_registro = ANY (ARRAY['automatico','cargado_admin'])
UNION ALL
SELECT er.alumno_id, COALESCE(er.confirmed_at::date, er.created_at::date), 'cargo_reserva',
  COALESCE(e.title,'Evento') || CASE WHEN er.package_nombre_snapshot IS NOT NULL THEN ' — '||er.package_nombre_snapshot ELSE '' END,
  'event_reservations', er.id, COALESCE(er.amount_total, er.price_snapshot, er.monto, 0), 0::numeric,
  COALESCE(er.currency_snapshot, er.moneda, e.currency, 'ARS'), er.reservation_status,
  jsonb_build_object('event_id', er.event_id, 'event_title', e.title, 'package_id', er.package_id, 'amount_total', er.amount_total, 'amount_paid', er.amount_paid, 'balance_due', er.balance_due, 'payment_plan_id', er.payment_plan_id)
FROM event_reservations er LEFT JOIN events e ON e.id = er.event_id
WHERE er.alumno_id IS NOT NULL AND er.cancelled_at IS NULL AND COALESCE(er.reservation_status,'pendiente') <> 'cancelada'
UNION ALL
SELECT rp.alumno_id, COALESCE(rp.payment_date, rp.created_at::date), 'pago_reserva',
  ('Pago '||COALESCE(e.title,'Evento')) || CASE WHEN rp.payment_method IS NOT NULL THEN ' ('||rp.payment_method||')' ELSE '' END,
  'reservation_payments', rp.id, 0::numeric, COALESCE(rp.equivalent_amount_event_currency, rp.amount, 0),
  COALESCE(rp.event_currency, rp.currency, 'ARS'), rp.status,
  jsonb_build_object('reservation_id', rp.reservation_id, 'event_id', er.event_id, 'event_title', e.title, 'payment_method', rp.payment_method, 'installment_id', rp.installment_id, 'installment_number', rp.installment_number, 'original_amount', rp.original_amount, 'original_currency', rp.original_currency)
FROM reservation_payments rp LEFT JOIN event_reservations er ON er.id = rp.reservation_id LEFT JOIN events e ON e.id = er.event_id
WHERE rp.alumno_id IS NOT NULL AND rp.status = 'validado' AND rp.anulado_at IS NULL
UNION ALL
SELECT sp.alumno_id, sp.created_at::date, 'cargo_preventa', 'Preventa: '||COALESCE(sp.producto_nombre,'—'),
  'store_preorders', sp.id, COALESCE(sp.precio_total, sp.precio_unitario * COALESCE(sp.cantidad,1), 0), 0::numeric,
  COALESCE(sp.moneda,'ARS'), sp.estado,
  jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'cantidad', sp.cantidad, 'variante', sp.variante, 'sena_monto', sp.sena_monto, 'saldo_pendiente', sp.saldo_pendiente, 'estado_pago_sena', sp.estado_pago_sena)
FROM store_preorders sp
WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL AND COALESCE(sp.estado,'') <> 'cancelada'
UNION ALL
-- PREVENTAS: pago de seña (haber) — incluye 'confirmada' (estado real al pagarse por MP)
SELECT sp.alumno_id, COALESCE(sp.sena_pagada_at::date, sp.updated_at::date), 'pago_preventa',
  ('Seña preventa: '||COALESCE(sp.producto_nombre,'—')) || CASE WHEN sp.forma_pago_sena IS NOT NULL THEN ' ('||sp.forma_pago_sena||')' ELSE '' END,
  'store_preorders', sp.id, 0::numeric, COALESCE(sp.sena_monto, 0), COALESCE(sp.moneda,'ARS'), 'sena_pagada',
  jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'forma_pago_sena', sp.forma_pago_sena, 'mp_payment_id', sp.mp_payment_id, 'tipo_pago', 'sena')
FROM store_preorders sp
WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL
  AND sp.estado_pago_sena = ANY (ARRAY['pagado','aprobado','pagada','confirmada','pendiente_verificacion'])
  AND COALESCE(sp.sena_monto, 0) > 0
UNION ALL
SELECT sp.alumno_id, COALESCE(sp.entregada_at::date, sp.updated_at::date), 'pago_preventa',
  'Saldo final preventa: '||COALESCE(sp.producto_nombre,'—'),
  'store_preorders', sp.id, 0::numeric,
  GREATEST(COALESCE(sp.precio_total,0) - COALESCE(sp.sena_monto,0), 0),
  COALESCE(sp.moneda,'ARS'), COALESCE(sp.estado,'completada')::text,
  jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'tipo_pago','saldo_final')
FROM store_preorders sp
WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL
  AND COALESCE(sp.saldo_pendiente,0) <= 0 AND COALESCE(sp.precio_total,0) > COALESCE(sp.sena_monto,0)
UNION ALL
SELECT so.alumno_id, so.created_at::date, 'cargo_tienda',
  'Tienda — Orden #'||COALESCE(so.order_number::text, so.id::text), 'store_orders', so.id,
  COALESCE(so.total,0), 0::numeric, COALESCE(so.currency,'ARS'), so.status,
  jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id)
FROM store_orders so WHERE so.alumno_id IS NOT NULL AND COALESCE(so.status,'') <> 'cancelada'
UNION ALL
SELECT so.alumno_id, COALESCE(so.pagado_at::date, so.updated_at::date), 'pago_tienda',
  ('Pago tienda — Orden #'||COALESCE(so.order_number::text, so.id::text)) || CASE WHEN so.metodo_pago IS NOT NULL THEN ' ('||so.metodo_pago||')' ELSE '' END,
  'store_orders', so.id, 0::numeric, COALESCE(so.total,0), COALESCE(so.currency,'ARS'), so.status,
  jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id)
FROM store_orders so
WHERE so.alumno_id IS NOT NULL AND (so.pagado_at IS NOT NULL OR so.status = ANY (ARRAY['pagada','pagado','completada','entregada']))
UNION ALL
SELECT ca.alumno_id, ca.fecha, 'ajuste_cargo', ca.concepto, 'cuenta_ajustes', ca.id, ca.monto, 0::numeric, ca.moneda, 'registrado',
  jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by)
FROM cuenta_ajustes ca WHERE ca.tipo = 'cargo'
UNION ALL
SELECT ca.alumno_id, ca.fecha, 'ajuste_credito', ca.concepto, 'cuenta_ajustes', ca.id, 0::numeric, ca.monto, ca.moneda, 'registrado',
  jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by)
FROM cuenta_ajustes ca WHERE ca.tipo = 'credito';

GRANT SELECT ON public.vw_cuenta_corriente_movimientos TO authenticated;
GRANT SELECT ON public.vw_cuenta_corriente_movimientos TO service_role;