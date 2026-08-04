
DROP VIEW IF EXISTS public.vw_cuenta_corriente_movimientos;

CREATE VIEW public.vw_cuenta_corriente_movimientos AS
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
            WHEN s.metodo_pago = 'saldo_a_favor'::text AND (EXISTS ( SELECT 1
               FROM cuenta_ajustes ca
              WHERE ca.tipo = 'credito'::text AND ca.aplicado_a_fuente_tabla = 'suscripciones'::text AND ca.aplicado_a_fuente_id = s.id)) THEN ' (saldo a favor aplicado)'::text
            WHEN s.metodo_pago IS NOT NULL THEN (' ('::text || s.metodo_pago) || ')'::text
            ELSE ''::text
        END AS concepto,
    'suscripciones'::text AS fuente_tabla,
    s.id AS fuente_id,
    0::numeric AS debe,
        CASE
            WHEN s.metodo_pago = 'saldo_a_favor'::text AND (EXISTS ( SELECT 1
               FROM cuenta_ajustes ca
              WHERE ca.tipo = 'credito'::text AND ca.aplicado_a_fuente_tabla = 'suscripciones'::text AND ca.aplicado_a_fuente_id = s.id)) THEN 0::numeric
            WHEN s.metodo_pago = 'mercadopago'::text THEN COALESCE(( SELECT sum(mp.amount) AS sum
               FROM mp_account_movements mp
              WHERE mp.suscripcion_id = s.id AND mp.status = 'approved'::text),
            CASE
                WHEN s.mp_status = 'approved'::text THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
                ELSE 0::numeric
            END)
            ELSE COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
        END AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', s.metodo_pago, 'origen_registro', s.origen_registro, 'mp_payment_id', s.mp_payment_id, 'cuenta_mp_id', s.cuenta_mp_id, 'notas', s.notas, 'fecha_pago', s.fecha_inicio) AS referencia_extra
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL AND s.metodo_pago IS NOT NULL AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'finalizada'::text, 'conciliado'::text])) AND (s.origen_registro = ANY (ARRAY['automatico'::text, 'cargado_admin'::text])) AND (s.metodo_pago <> 'mercadopago'::text OR s.mp_status = 'approved'::text OR (EXISTS ( SELECT 1
           FROM mp_account_movements mp
          WHERE mp.suscripcion_id = s.id AND mp.status = 'approved'::text)))
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
    jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id, 'cuenta_mp_id', so.cuenta_mp_id, 'referencia_externa', so.mp_external_reference, 'notas', so.notes, 'fecha_pago', so.pagado_at) AS referencia_extra
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
    ca.concepto ||
      CASE WHEN ca.aplicado_a_fuente_tabla IN ('suscripciones','event_reservations')
           THEN ' — aplicado'::text ELSE ''::text END AS concepto,
    COALESCE(ca.aplicado_a_fuente_tabla, 'cuenta_ajustes'::text) AS fuente_tabla,
    COALESCE(ca.aplicado_a_fuente_id, ca.id) AS fuente_id,
    0::numeric AS debe,
    -- Si el crédito ya fue aplicado a una suscripción o a una reserva, el haber
    -- lo aporta el pago del destino (pago_suscripcion / pago_reserva): no se cuenta dos veces.
    CASE
      WHEN ca.aplicado_a_fuente_tabla = 'suscripciones' AND EXISTS (
        SELECT 1 FROM suscripciones su
         WHERE su.id = ca.aplicado_a_fuente_id
           AND su.cancelada_at IS NULL
           AND COALESCE(su.metodo_pago,'') <> 'saldo_a_favor'
      ) THEN 0::numeric
      WHEN ca.aplicado_a_fuente_tabla = 'event_reservations' AND EXISTS (
        SELECT 1 FROM reservation_payments rp
         WHERE rp.reservation_id = ca.aplicado_a_fuente_id
           AND rp.anulado_at IS NULL
           AND rp.status = 'validado'
           AND rp.notes ILIKE '%' || ca.id::text || '%'
      ) THEN 0::numeric
      ELSE ca.monto
    END AS haber,
    ca.moneda,
    'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa, 'aplicado_a_fuente_tabla', ca.aplicado_a_fuente_tabla, 'aplicado_a_fuente_id', ca.aplicado_a_fuente_id) AS referencia_extra
   FROM cuenta_ajustes ca
  WHERE ca.tipo = 'credito'::text;

GRANT SELECT ON public.vw_cuenta_corriente_movimientos TO authenticated;
GRANT ALL ON public.vw_cuenta_corriente_movimientos TO service_role;

-- 2) Alta de mensualidad desde la asignación de un pago de Mercado Pago
CREATE OR REPLACE FUNCTION public.assign_mp_movement_to_new_suscripcion(
  _movement_id uuid,
  _alumno_id uuid,
  _plan_id uuid,
  _fecha_inicio date DEFAULT NULL,
  _precio numeric DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
  v_plan record;
  v_inicio date;
  v_fin date;
  v_precio numeric;
  v_sub_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
  IF v_mov.alumno_id IS NOT NULL AND v_mov.alumno_id <> _alumno_id THEN
    RAISE EXCEPTION 'already_assigned_to_other_student';
  END IF;
  IF v_mov.status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'only_approved_movements_can_be_assigned'; END IF;
  IF v_mov.suscripcion_id IS NOT NULL THEN RAISE EXCEPTION 'movement_already_linked_to_subscription'; END IF;

  SELECT * INTO v_plan FROM public.planes WHERE id = _plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  v_inicio := COALESCE(_fecha_inicio, date_trunc('month', (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date);
  v_inicio := date_trunc('month', v_inicio)::date;
  v_fin := (v_inicio + INTERVAL '1 month - 1 day')::date;
  v_precio := COALESCE(_precio, v_plan.precio, 0);

  IF EXISTS (
    SELECT 1 FROM public.suscripciones s
     WHERE s.alumno_id = _alumno_id
       AND s.plan_id = _plan_id
       AND s.fecha_inicio = v_inicio
       AND s.cancelada_at IS NULL
       AND s.estado <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'subscription_already_exists_for_period';
  END IF;

  PERFORM set_config('app.sub_internal', 'on', true);

  INSERT INTO public.suscripciones (
    alumno_id, plan_id, estado, fecha_inicio, fecha_fin,
    precio_base, precio_final, metodo_pago, mp_payment_id, mp_status,
    cuenta_mp_id, origen_registro, auto_renovacion, notas
  ) VALUES (
    _alumno_id, _plan_id,
    CASE WHEN v_fin < CURRENT_DATE THEN 'finalizada' ELSE 'activa' END,
    v_inicio, v_fin,
    v_precio, v_precio, 'mercadopago', v_mov.mp_payment_id, 'approved',
    v_mov.cuenta_mp_id, 'cargado_admin',
    (v_fin >= CURRENT_DATE),
    COALESCE(_notes, 'Mensualidad generada al asignar el pago MP. Op ' || COALESCE(v_mov.mp_payment_id, '-'))
  ) RETURNING id INTO v_sub_id;

  PERFORM set_config('app.sub_internal', 'off', true);

  UPDATE public.mp_account_movements SET
    alumno_id = _alumno_id,
    suscripcion_id = v_sub_id,
    assigned_manually = true,
    assigned_by = auth.uid(),
    assigned_at = now(),
    assign_notes = COALESCE(_notes, assign_notes)
  WHERE id = _movement_id;

  RETURN jsonb_build_object('ok', true, 'created', true, 'suscripcion_id', v_sub_id, 'fecha_inicio', v_inicio, 'precio', v_precio);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_mp_movement_to_new_suscripcion(uuid, uuid, uuid, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_mp_movement_to_new_suscripcion(uuid, uuid, uuid, date, numeric, text) TO authenticated, service_role;

-- 3) Destinos de pago: sumar planes disponibles del alumno
CREATE OR REPLACE FUNCTION public.get_alumno_payment_targets(_alumno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reservations jsonb;
  v_subs jsonb;
  v_cargos jsonb;
  v_planes jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha' DESC), '[]'::jsonb) INTO v_reservations
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'label', COALESCE(e.title, 'Evento'),
      'currency', COALESCE(r.currency_snapshot, e.currency, 'ARS'),
      'total', COALESCE(r.amount_total, 0),
      'paid', COALESCE(r.amount_paid, 0),
      'balance', COALESCE(r.balance_due, 0),
      'fecha', COALESCE(e.start_date::text, r.created_at::date::text)
    ) AS x
    FROM public.event_reservations r
    LEFT JOIN public.events e ON e.id = r.event_id
    WHERE r.alumno_id = _alumno_id
      AND COALESCE(r.estado, '') NOT IN ('cancelada', 'cancelado', 'rechazada', 'expirada')
      AND COALESCE(r.balance_due, 0) > 0
  ) s;

  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'fecha' DESC), '[]'::jsonb) INTO v_subs
  FROM (
    SELECT jsonb_build_object(
      'id', su.id,
      'label', COALESCE(p.nombre, 'Plan'),
      'currency', COALESCE(p.moneda, 'ARS'),
      'total', COALESCE(su.precio_final, su.precio_base, 0),
      'estado', su.estado,
      'fecha', su.fecha_inicio::text
    ) AS y
    FROM public.suscripciones su
    LEFT JOIN public.planes p ON p.id = su.plan_id
    WHERE su.alumno_id = _alumno_id
      AND su.estado IN ('pendiente', 'pendiente_verificacion', 'vencida', 'activa')
      AND COALESCE(su.mp_status, '') <> 'approved'
      AND su.mp_payment_id IS NULL
  ) s2;

  SELECT COALESCE(jsonb_agg(z ORDER BY z->>'fecha' DESC), '[]'::jsonb) INTO v_cargos
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'label', COALESCE(NULLIF(c.concepto, ''), 'Cargo en cuenta corriente'),
      'currency', COALESCE(c.moneda, 'ARS'),
      'total', c.monto,
      'paid', COALESCE(ap.aplicado, 0),
      'balance', c.monto - COALESCE(ap.aplicado, 0),
      'fecha', c.fecha::text
    ) AS z
    FROM public.cuenta_ajustes c
    LEFT JOIN LATERAL (
      SELECT SUM(cr.monto) AS aplicado
      FROM public.cuenta_ajustes cr
      WHERE cr.tipo = 'credito'
        AND cr.aplicado_a_fuente_tabla = 'cuenta_ajustes'
        AND cr.aplicado_a_fuente_id = c.id
    ) ap ON true
    WHERE c.alumno_id = _alumno_id
      AND c.tipo = 'cargo'
      AND c.monto - COALESCE(ap.aplicado, 0) > 0.01
  ) s3;

  -- Planes disponibles para generar una mensualidad nueva desde la asignación.
  -- Prioriza los planes que el alumno ya usó, luego el resto de los activos.
  SELECT COALESCE(jsonb_agg(w ORDER BY (w->>'usado')::boolean DESC, w->>'label'), '[]'::jsonb) INTO v_planes
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'label', p.nombre,
      'currency', COALESCE(p.moneda, 'ARS'),
      'precio', COALESCE(p.precio, 0),
      'usado', EXISTS (SELECT 1 FROM public.suscripciones su2 WHERE su2.alumno_id = _alumno_id AND su2.plan_id = p.id)
    ) AS w
    FROM public.planes p
    WHERE COALESCE(p.activo, true) = true
       OR EXISTS (SELECT 1 FROM public.suscripciones su3 WHERE su3.alumno_id = _alumno_id AND su3.plan_id = p.id)
  ) s4;

  RETURN jsonb_build_object(
    'reservations', v_reservations,
    'subscriptions', v_subs,
    'cargos', v_cargos,
    'planes', v_planes
  );
END;
$function$;
