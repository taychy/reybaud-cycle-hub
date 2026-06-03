CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
SELECT s.alumno_id,
    COALESCE(s.fecha_inicio, s.created_at::date) AS fecha,
    'cargo_suscripcion'::text AS tipo,
    'Plan: '::text || COALESCE(p.nombre, '—'::text) AS concepto,
    'suscripciones'::text AS fuente_tabla,
    s.id AS fuente_id,
    CASE
      WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'::text
        THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
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
    COALESCE(ri.due_date, er.created_at::date) AS fecha,
    'cargo_reserva'::text AS tipo,
    COALESCE(e.title, 'Evento'::text) ||
        CASE
            WHEN ri.label IS NOT NULL THEN ' — '::text || ri.label
            ELSE ' — Cuota '::text || ri.installment_number::text
        END AS concepto,
    'reservation_installments'::text AS fuente_tabla,
    ri.id AS fuente_id,
    COALESCE(ri.amount, 0::numeric) AS debe,
    0::numeric AS haber,
    COALESCE(ri.currency, er.currency_snapshot, e.currency, 'ARS'::text) AS moneda,
    ri.status AS estado,
    jsonb_build_object('reservation_id', er.id, 'event_id', er.event_id, 'event_title', e.title, 'installment_number', ri.installment_number, 'condoned_amount', ri.condoned_amount) AS referencia_extra
   FROM reservation_installments ri
     JOIN event_reservations er ON er.id = ri.reservation_id
     LEFT JOIN events e ON e.id = er.event_id
  WHERE er.alumno_id IS NOT NULL
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
    jsonb_build_object('reservation_id', rp.reservation_id, 'event_id', er.event_id, 'event_title', e.title, 'payment_method', rp.payment_method, 'installment_id', rp.installment_id, 'original_amount', rp.original_amount, 'original_currency', rp.original_currency) AS referencia_extra
   FROM reservation_payments rp
     LEFT JOIN event_reservations er ON er.id = rp.reservation_id
     LEFT JOIN events e ON e.id = er.event_id
  WHERE rp.alumno_id IS NOT NULL AND rp.status = 'validado'::text AND rp.anulado_at IS NULL
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
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by) AS referencia_extra
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
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by) AS referencia_extra
   FROM cuenta_ajustes ca
  WHERE ca.tipo = 'credito'::text;