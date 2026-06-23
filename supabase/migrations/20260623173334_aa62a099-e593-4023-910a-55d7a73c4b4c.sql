
CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
 SELECT s.alumno_id,
    COALESCE(s.fecha_inicio, s.created_at::date) AS fecha,
    'cargo_suscripcion'::text AS tipo,
    'Plan: '::text || COALESCE(p.nombre, '—'::text) AS concepto,
    'suscripciones'::text AS fuente_tabla,
    s.id AS fuente_id,
        CASE
            WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'::text THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
            ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0::numeric)
        END AS debe,
    0::numeric AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre) AS referencia_extra
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL AND s.estado <> 'cancelada'::text
UNION ALL
 SELECT s.alumno_id,
    COALESCE(
        CASE
            WHEN s.origen_registro = ANY (ARRAY['automatico'::text, 'cargado_admin'::text]) THEN s.fecha_inicio
            ELSE NULL::date
        END, s.updated_at::date) AS fecha,
    'pago_suscripcion'::text AS tipo,
    ('Pago plan: '::text || COALESCE(p.nombre, '—'::text)) ||
        CASE
            WHEN s.metodo_pago IS NOT NULL THEN (' ('::text || s.metodo_pago) || ')'::text
            ELSE ''::text
        END AS concepto,
    'suscripciones'::text AS fuente_tabla,
    s.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric) AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', s.metodo_pago, 'origen_registro', s.origen_registro, 'mp_payment_id', s.mp_payment_id) AS referencia_extra
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL AND s.metodo_pago IS NOT NULL AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'conciliado'::text])) AND (s.origen_registro = ANY (ARRAY['automatico'::text, 'cargado_admin'::text]))
UNION ALL
 SELECT er.alumno_id,
    COALESCE(er.confirmed_at::date, er.created_at::date) AS fecha,
    'cargo_reserva'::text AS tipo,
    COALESCE(e.title, 'Evento'::text) ||
        CASE
            WHEN er.package_nombre_snapshot IS NOT NULL THEN ' — '::text || er.package_nombre_snapshot
            ELSE ''::text
        END AS concepto,
    'event_reservations'::text AS fuente_tabla,
    er.id AS fuente_id,
    COALESCE(er.amount_total, er.price_snapshot, er.monto, 0::numeric) AS debe,
    0::numeric AS haber,
    COALESCE(er.currency_snapshot, er.moneda, e.currency, 'ARS'::text) AS moneda,
    er.reservation_status AS estado,
    jsonb_build_object('event_id', er.event_id, 'event_title', e.title, 'package_id', er.package_id, 'amount_total', er.amount_total, 'amount_paid', er.amount_paid, 'balance_due', er.balance_due, 'payment_plan_id', er.payment_plan_id) AS referencia_extra
   FROM event_reservations er
     LEFT JOIN events e ON e.id = er.event_id
  WHERE er.alumno_id IS NOT NULL AND er.cancelled_at IS NULL AND COALESCE(er.reservation_status, 'pendiente'::text) <> 'cancelada'::text
UNION ALL
 SELECT rp.alumno_id,
    COALESCE(rp.payment_date, rp.created_at::date) AS fecha,
    'pago_reserva'::text AS tipo,
    ('Pago '::text || COALESCE(e.title, 'Evento'::text)) ||
        CASE
            WHEN rp.payment_method IS NOT NULL THEN (' ('::text || rp.payment_method) || ')'::text
            ELSE ''::text
        END AS concepto,
    'reservation_payments'::text AS fuente_tabla,
    rp.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(rp.equivalent_amount_event_currency, rp.amount, 0::numeric) AS haber,
    COALESCE(rp.event_currency, rp.currency, 'ARS'::text) AS moneda,
    rp.status AS estado,
    jsonb_build_object('reservation_id', rp.reservation_id, 'event_id', er.event_id, 'event_title', e.title, 'payment_method', rp.payment_method, 'installment_id', rp.installment_id, 'installment_number', rp.installment_number, 'original_amount', rp.original_amount, 'original_currency', rp.original_currency) AS referencia_extra
   FROM reservation_payments rp
     LEFT JOIN event_reservations er ON er.id = rp.reservation_id
     LEFT JOIN events e ON e.id = er.event_id
  WHERE rp.alumno_id IS NOT NULL AND rp.status = 'validado'::text AND rp.anulado_at IS NULL
UNION ALL
 SELECT sp.alumno_id,
    sp.created_at::date AS fecha,
    'cargo_preventa'::text AS tipo,
    'Preventa: '::text || COALESCE(sp.producto_nombre, '—'::text) AS concepto,
    'store_preorders'::text AS fuente_tabla,
    sp.id AS fuente_id,
    COALESCE(sp.precio_total, sp.precio_unitario * COALESCE(sp.cantidad, 1)::numeric, 0::numeric) AS debe,
    0::numeric AS haber,
    COALESCE(sp.moneda, 'ARS'::text) AS moneda,
    sp.estado,
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'cantidad', sp.cantidad, 'variante', sp.variante, 'sena_monto', sp.sena_monto, 'saldo_pendiente', sp.saldo_pendiente, 'estado_pago_sena', sp.estado_pago_sena) AS referencia_extra
   FROM store_preorders sp
  WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL AND COALESCE(sp.estado, ''::text) <> 'cancelada'::text
UNION ALL
 SELECT sp.alumno_id,
    COALESCE(sp.sena_pagada_at::date, sp.updated_at::date) AS fecha,
    'pago_preventa'::text AS tipo,
    ('Seña preventa: '::text || COALESCE(sp.producto_nombre, '—'::text)) ||
        CASE
            WHEN sp.forma_pago_sena IS NOT NULL THEN (' ('::text || sp.forma_pago_sena) || ')'::text
            ELSE ''::text
        END AS concepto,
    'store_preorders'::text AS fuente_tabla,
    sp.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(sp.sena_monto, 0::numeric) AS haber,
    COALESCE(sp.moneda, 'ARS'::text) AS moneda,
    'sena_pagada'::text AS estado,
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'forma_pago_sena', sp.forma_pago_sena, 'mp_payment_id', sp.mp_payment_id, 'tipo_pago', 'sena') AS referencia_extra
   FROM store_preorders sp
  WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL AND (sp.estado_pago_sena = ANY (ARRAY['pagado'::text, 'aprobado'::text, 'pagada'::text, 'confirmada'::text])) AND COALESCE(sp.sena_monto, 0::numeric) > 0::numeric
UNION ALL
 SELECT sp.alumno_id,
    COALESCE(sp.entregada_at::date, sp.updated_at::date) AS fecha,
    'pago_preventa'::text AS tipo,
    'Saldo final preventa: '::text || COALESCE(sp.producto_nombre, '—'::text) AS concepto,
    'store_preorders'::text AS fuente_tabla,
    sp.id AS fuente_id,
    0::numeric AS debe,
    GREATEST(COALESCE(sp.precio_total, 0::numeric) - COALESCE(sp.sena_monto, 0::numeric), 0::numeric) AS haber,
    COALESCE(sp.moneda, 'ARS'::text) AS moneda,
    COALESCE(sp.estado, 'completada'::text) AS estado,
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'tipo_pago', 'saldo_final') AS referencia_extra
   FROM store_preorders sp
  WHERE sp.alumno_id IS NOT NULL AND sp.cancelada_at IS NULL AND COALESCE(sp.saldo_pendiente, 0::numeric) <= 0::numeric AND COALESCE(sp.precio_total, 0::numeric) > COALESCE(sp.sena_monto, 0::numeric)
UNION ALL
 SELECT so.alumno_id,
    so.created_at::date AS fecha,
    'cargo_tienda'::text AS tipo,
    'Tienda — Orden #'::text || COALESCE(so.order_number::text, so.id::text) AS concepto,
    'store_orders'::text AS fuente_tabla,
    so.id AS fuente_id,
    COALESCE(so.total, 0::numeric) AS debe,
    0::numeric AS haber,
    COALESCE(so.currency, 'ARS'::text) AS moneda,
    so.status AS estado,
    jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id) AS referencia_extra
   FROM store_orders so
  WHERE so.alumno_id IS NOT NULL AND COALESCE(so.status, ''::text) <> 'cancelada'::text
UNION ALL
 SELECT so.alumno_id,
    COALESCE(so.pagado_at::date, so.updated_at::date) AS fecha,
    'pago_tienda'::text AS tipo,
    ('Pago tienda — Orden #'::text || COALESCE(so.order_number::text, so.id::text)) ||
        CASE
            WHEN so.metodo_pago IS NOT NULL THEN (' ('::text || so.metodo_pago) || ')'::text
            ELSE ''::text
        END AS concepto,
    'store_orders'::text AS fuente_tabla,
    so.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(so.total, 0::numeric) AS haber,
    COALESCE(so.currency, 'ARS'::text) AS moneda,
    so.status AS estado,
    jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id) AS referencia_extra
   FROM store_orders so
  WHERE so.alumno_id IS NOT NULL AND (so.pagado_at IS NOT NULL OR (so.status = ANY (ARRAY['pagada'::text, 'pagado'::text, 'completada'::text, 'entregada'::text])))
UNION ALL
 SELECT ca.alumno_id,
    ca.fecha,
    'ajuste_cargo'::text AS tipo,
    ca.concepto,
    'cuenta_ajustes'::text AS fuente_tabla,
    ca.id AS fuente_id,
    ca.monto AS debe,
    0::numeric AS haber,
    ca.moneda,
    'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa) AS referencia_extra
   FROM cuenta_ajustes ca
  WHERE ca.tipo = 'cargo'::text
UNION ALL
 SELECT ca.alumno_id,
    ca.fecha,
    'ajuste_credito'::text AS tipo,
    ca.concepto,
    'cuenta_ajustes'::text AS fuente_tabla,
    ca.id AS fuente_id,
    0::numeric AS debe,
    ca.monto AS haber,
    ca.moneda,
    'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa) AS referencia_extra
   FROM cuenta_ajustes ca
  WHERE ca.tipo = 'credito'::text;
