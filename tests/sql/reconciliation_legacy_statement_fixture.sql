CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos WITH (security_invoker=true) AS SELECT s.alumno_id,
    COALESCE(s.fecha_inicio, s.created_at::date) AS fecha,
    'cargo_suscripcion'::text AS tipo,
    'Plan: '::text || COALESCE(p.nombre, '—'::text) AS concepto,
    'suscripciones'::text AS fuente_tabla,
    s.id AS fuente_id,
    COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric) AS debe,
    0::numeric AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre) AS referencia_extra
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL AND s.estado <> 'cancelada'::text
UNION ALL
 SELECT s.alumno_id,
    (mp.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires'::text)::date AS fecha,
    'pago_suscripcion'::text AS tipo,
    ('Pago plan: '::text || COALESCE(p.nombre, '—'::text)) || ' (mercadopago)'::text AS concepto,
    'mp_account_movements'::text AS fuente_tabla,
    mp.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(mp.amount, 0::numeric) AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('suscripcion_id', s.id, 'plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', 'mercadopago', 'origen_registro', s.origen_registro, 'mp_payment_id', mp.mp_payment_id, 'mp_movement_id', mp.id, 'cuenta_mp_id', mp.cuenta_mp_id, 'notas', s.notas, 'fecha_pago', mp.fecha_movimiento) AS referencia_extra
   FROM mp_account_movements mp
     JOIN suscripciones s ON s.id = mp.suscripcion_id
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE mp.status = 'approved'::text AND s.cancelada_at IS NULL AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'finalizada'::text, 'conciliado'::text])) AND is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id)
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
            WHEN s.metodo_pago = 'saldo_a_favor'::text AND (EXISTS ( SELECT 1
               FROM cuenta_ajustes ca
              WHERE ca.tipo = 'credito'::text AND ca.aplicado_a_fuente_tabla = 'suscripciones'::text AND ca.aplicado_a_fuente_id = s.id)) THEN ' (saldo a favor aplicado)'::text
            WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'::text THEN (' ('::text || s.metodo_pago) || ')'::text
            ELSE ''::text
        END AS concepto,
    'suscripciones'::text AS fuente_tabla,
    s.id AS fuente_id,
    0::numeric AS debe,
        CASE
            WHEN s.metodo_pago = 'saldo_a_favor'::text AND (EXISTS ( SELECT 1
               FROM cuenta_ajustes ca
              WHERE ca.tipo = 'credito'::text AND ca.aplicado_a_fuente_tabla = 'suscripciones'::text AND ca.aplicado_a_fuente_id = s.id)) THEN 0::numeric
            ELSE COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
        END AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', s.metodo_pago, 'origen_registro', s.origen_registro, 'mp_payment_id', s.mp_payment_id, 'cuenta_mp_id', s.cuenta_mp_id, 'notas', s.notas, 'fecha_pago', s.fecha_inicio) AS referencia_extra
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'finalizada'::text, 'conciliado'::text])) AND is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id) AND NOT (EXISTS ( SELECT 1
           FROM mp_account_movements mp2
          WHERE mp2.suscripcion_id = s.id AND mp2.status = 'approved'::text))
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
    jsonb_build_object('reservation_id', rp.reservation_id, 'event_id', er.event_id, 'event_title', e.title, 'payment_method', rp.payment_method, 'installment_id', rp.installment_id, 'installment_number', rp.installment_number, 'original_amount', rp.original_amount, 'original_currency', rp.original_currency, 'cuenta_mp_id', rp.cuenta_mp_id, 'referencia_externa', rp.payment_reference, 'comprobante_url', rp.proof_url, 'notas', rp.notes, 'fecha_pago', rp.payment_date) AS referencia_extra
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
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'forma_pago_sena', sp.forma_pago_sena, 'mp_payment_id', sp.mp_payment_id, 'cuenta_mp_id', sp.cuenta_mp_id, 'notas', sp.notas, 'fecha_pago', sp.sena_pagada_at, 'tipo_pago', 'sena') AS referencia_extra
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
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'cuenta_mp_id', sp.cuenta_mp_id, 'fecha_pago', sp.entregada_at, 'tipo_pago', 'saldo_final') AS referencia_extra
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
  WHERE so.alumno_id IS NOT NULL AND (COALESCE(so.status, ''::text) <> ALL (ARRAY['cancelada'::text, 'cancelado'::text])) AND so.cancelled_at IS NULL
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
    jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id, 'cuenta_mp_id', so.cuenta_mp_id, 'referencia_externa', so.mp_external_reference, 'notas', so.notes, 'fecha_pago', so.pagado_at) AS referencia_extra
   FROM store_orders so
  WHERE so.alumno_id IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM cuenta_ajustes ca2
          WHERE ca2.tipo = 'credito'::text AND ca2.aplicado_a_fuente_tabla = 'store_orders'::text AND ca2.aplicado_a_fuente_id = so.id)) AND (so.pagado_at IS NOT NULL OR (so.status = ANY (ARRAY['pagada'::text, 'pagado'::text, 'completada'::text, 'entregada'::text])))
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
    ca.concepto ||
        CASE
            WHEN ca.aplicado_a_fuente_tabla = ANY (ARRAY['suscripciones'::text, 'event_reservations'::text]) THEN ' — aplicado'::text
            ELSE ''::text
        END AS concepto,
    COALESCE(ca.aplicado_a_fuente_tabla, 'cuenta_ajustes'::text) AS fuente_tabla,
    COALESCE(ca.aplicado_a_fuente_id, ca.id) AS fuente_id,
    0::numeric AS debe,
        CASE
            WHEN ca.aplicado_a_fuente_tabla = 'suscripciones'::text AND (EXISTS ( SELECT 1
               FROM suscripciones su
              WHERE su.id = ca.aplicado_a_fuente_id AND su.cancelada_at IS NULL AND COALESCE(su.metodo_pago, ''::text) <> 'saldo_a_favor'::text)) THEN 0::numeric
            WHEN ca.aplicado_a_fuente_tabla = 'event_reservations'::text AND (EXISTS ( SELECT 1
               FROM reservation_payments rp
              WHERE rp.reservation_id = ca.aplicado_a_fuente_id AND rp.anulado_at IS NULL AND rp.status = 'validado'::text AND rp.notes ~~* (('%'::text || ca.id::text) || '%'::text))) THEN 0::numeric
            ELSE ca.monto
        END AS haber,
    ca.moneda,
    'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa, 'aplicado_a_fuente_tabla', ca.aplicado_a_fuente_tabla, 'aplicado_a_fuente_id', ca.aplicado_a_fuente_id) AS referencia_extra
   FROM cuenta_ajustes ca
  WHERE ca.tipo = 'credito'::text
UNION ALL
 SELECT pi.alumno_id,
    pi.created_at::date AS fecha,
    'pago_imputacion'::text AS tipo,
    'Aplicación de saldo disponible'::text AS concepto,
    'pagos_imputaciones'::text AS fuente_tabla,
    pi.id AS fuente_id,
    0::numeric AS debe,
    pi.monto AS haber,
    pi.moneda,
    'imputado'::text AS estado,
    jsonb_build_object('pago_origen_tipo', pi.pago_origen_tipo, 'pago_origen_id', pi.pago_origen_id, 'obligacion_tipo', pi.obligacion_tipo, 'obligacion_id', pi.obligacion_id, 'metadata', pi.metadata) AS referencia_extra
   FROM pagos_imputaciones pi
  WHERE pi.anulado_at IS NULL AND NOT pago_consumido_legacy(pi.pago_origen_tipo, pi.pago_origen_id)
UNION ALL
 SELECT dli.alumno_id,
    COALESCE(dl.fecha_entrega, dli.created_at::date) AS fecha,
    'cargo_entrega'::text AS tipo,
    ((('Entrega — '::text || COALESCE(dl.titulo, '—'::text)) || ' — '::text) || dli.producto) ||
        CASE
            WHEN COALESCE(dli.variante, ''::text) <> ''::text THEN (' ('::text || dli.variante) || ')'::text
            ELSE ''::text
        END AS concepto,
    'delivery_list_items'::text AS fuente_tabla,
    dli.id AS fuente_id,
    round(dli.precio_venta * COALESCE(dli.cantidad, 1::numeric), 2) AS debe,
    0::numeric AS haber,
    COALESCE(dli.moneda, 'ARS'::text) AS moneda,
        CASE
            WHEN dli.preparado THEN 'entregado'::text
            ELSE 'pendiente'::text
        END AS estado,
    jsonb_build_object('list_id', dli.list_id, 'list_title', dl.titulo, 'item_id', dli.id, 'producto', dli.producto, 'variante', dli.variante, 'cantidad', dli.cantidad, 'precio_unitario', dli.precio_venta, 'cliente_nombre', dli.cliente_nombre, 'alumno_id', dli.alumno_id, 'preparado', dli.preparado, 'fecha_entrega', dl.fecha_entrega, 'notas', dli.notas, 'source_type', dli.source_type) AS referencia_extra
   FROM delivery_list_items dli
     JOIN delivery_lists dl ON dl.id = dli.list_id
  WHERE dli.alumno_id IS NOT NULL AND COALESCE(dli.precio_venta, 0::numeric) > 0::numeric AND dli.source_order_id IS NULL AND dli.source_preorder_id IS NULL AND (COALESCE(dli.source_type, 'manual'::text) <> ALL (ARRAY['store_order'::text, 'store_preorder'::text, 'preventa'::text, 'orden_tienda'::text])) AND COALESCE(dl.estado, ''::text) <> 'cancelada'::text
UNION ALL
 SELECT dlp.alumno_id,
    COALESCE(dlp.validado_at::date, dlp.created_at::date) AS fecha,
    'pago_entrega'::text AS tipo,
    ('Pago entrega — '::text || COALESCE(dl.titulo, '—'::text)) ||
        CASE
            WHEN dlp.forma_pago IS NOT NULL THEN (' ('::text || dlp.forma_pago) || ')'::text
            ELSE ''::text
        END AS concepto,
    'delivery_list_payments'::text AS fuente_tabla,
    dlp.id AS fuente_id,
    0::numeric AS debe,
    COALESCE(dlp.monto, 0::numeric) AS haber,
    COALESCE(dlp.moneda, 'ARS'::text) AS moneda,
    'validado'::text AS estado,
    jsonb_build_object('list_id', dlp.list_id, 'list_title', dl.titulo, 'cliente_nombre', dlp.cliente_nombre, 'alumno_id', dlp.alumno_id, 'forma_pago', dlp.forma_pago, 'medio_pago', dlp.forma_pago, 'comprobante_path', dlp.comprobante_path, 'notas', dlp.notas, 'cargado_por_nombre', dlp.cargado_por_nombre, 'origen', dlp.origen, 'fecha_pago', COALESCE(dlp.validado_at, dlp.created_at), 'created_at', dlp.created_at, 'validado', dlp.validado, 'validado_at', dlp.validado_at, 'validado_notas', dlp.validado_notas) AS referencia_extra
   FROM delivery_list_payments dlp
     JOIN delivery_lists dl ON dl.id = dlp.list_id
  WHERE dlp.alumno_id IS NOT NULL AND dlp.validado = true AND dlp.rechazado IS DISTINCT FROM true
UNION ALL
 SELECT d.alumno_id,
    d.fecha,
    'devolucion'::text AS tipo,
    ('Devolución — '::text || COALESCE(d.motivo, 'reintegro'::text)) ||
        CASE
            WHEN e.title IS NOT NULL THEN ' — '::text || e.title
            ELSE ''::text
        END AS concepto,
    'devoluciones'::text AS fuente_tabla,
    d.id AS fuente_id,
    d.monto AS debe,
    0::numeric AS haber,
    d.moneda,
    'devuelto'::text AS estado,
    jsonb_build_object('medio_pago', d.metodo, 'referencia_externa', d.referencia, 'mp_payment_id', mp.mp_payment_id, 'mp_movement_id', d.mp_movement_id, 'cuenta_mp_id', d.cuenta_mp_id, 'reservation_id', d.reservation_id, 'reservation_payment_id', d.reservation_payment_id, 'suscripcion_id', d.suscripcion_id, 'store_order_id', d.store_order_id, 'store_order_number', so2.order_number, 'evento_nombre', e.title, 'motivo', d.motivo, 'notas', d.notas, 'fecha_pago', d.fecha) AS referencia_extra
   FROM devoluciones d
     LEFT JOIN mp_account_movements mp ON mp.id = d.mp_movement_id
     LEFT JOIN event_reservations er ON er.id = d.reservation_id
     LEFT JOIN events e ON e.id = er.event_id
     LEFT JOIN store_orders so2 ON so2.id = d.store_order_id
UNION ALL
 SELECT er.alumno_id,
    d.paid_at AS fecha,
    'pago_directo_reemplazo'::text AS tipo,
    'Pago directo al titular anterior — '::text || COALESCE(e.title, 'Evento'::text) AS concepto,
    'event_reservations'::text AS fuente_tabla,
    d.replacement_reservation_id AS fuente_id,
    0::numeric AS debe,
    d.amount AS haber,
    COALESCE(d.currency, er.currency_snapshot, 'ARS'::text) AS moneda,
    d.status AS estado,
    jsonb_build_object('direct_payment_id', d.id, 'transfer_id', d.transfer_id, 'caja_reybaud', 0, 'original_reservation_id', d.original_reservation_id, 'notas', d.notes) AS referencia_extra
   FROM reservation_transfer_direct_payments d
     JOIN event_reservations er ON er.id = d.replacement_reservation_id
     LEFT JOIN events e ON e.id = er.event_id
  WHERE d.status = 'confirmed'::text AND er.alumno_id IS NOT NULL
UNION ALL
 SELECT er.alumno_id,
    d.paid_at AS fecha,
    'reintegro_directo_recibido'::text AS tipo,
    'Reintegro recibido del reemplazante — '::text || COALESCE(e.title, 'Evento'::text) AS concepto,
    'event_reservations'::text AS fuente_tabla,
    d.original_reservation_id AS fuente_id,
    d.amount AS debe,
    0::numeric AS haber,
    COALESCE(d.currency, er.currency_snapshot, 'ARS'::text) AS moneda,
    d.status AS estado,
    jsonb_build_object('direct_payment_id', d.id, 'transfer_id', d.transfer_id, 'caja_reybaud', 0, 'replacement_reservation_id', d.replacement_reservation_id, 'notas', d.notes) AS referencia_extra
   FROM reservation_transfer_direct_payments d
     JOIN event_reservations er ON er.id = d.original_reservation_id
     LEFT JOIN events e ON e.id = er.event_id
  WHERE d.status = 'confirmed'::text AND er.alumno_id IS NOT NULL;
