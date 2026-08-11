-- ============================================================
-- FASE 1 — ESTABILIZACIÓN
-- ============================================================

-- 1) Regla central: ¿la suscripción tiene evidencia de pago confirmado?
CREATE OR REPLACE FUNCTION public.is_subscription_paid(
  _sub_id uuid,
  _metodo_pago text,
  _mp_status text,
  _origen_registro text,
  _chequeado_admin boolean,
  _mp_payment_id text
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    -- Evidencia Mercado Pago real
    (
      COALESCE(_mp_status, '') = 'approved'
      OR EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        WHERE mp.suscripcion_id = _sub_id AND mp.status = 'approved'
      )
    )
    OR
    -- Evidencia manual: medio de pago explícito y real (nunca 'pendiente'/null)
    (
      COALESCE(_metodo_pago, 'pendiente') NOT IN ('pendiente', 'mercadopago')
      AND (
        COALESCE(_origen_registro, '') IN ('automatico', 'cargado_admin')
        OR COALESCE(_chequeado_admin, false) = true   -- informado por alumno + aprobado por admin
      )
    )
$$;

COMMENT ON FUNCTION public.is_subscription_paid IS
  'Regla única de "mensualidad paga". Usada por vw_cuenta_corriente_movimientos y get_alumno_payment_targets.';

-- Wrapper por id (para uso puntual)
CREATE OR REPLACE FUNCTION public.is_subscription_paid(_sub_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id)
  FROM public.suscripciones s WHERE s.id = _sub_id
$$;

-- Monto realmente imputado/confirmado a una suscripción
CREATE OR REPLACE FUNCTION public.subscription_paid_amount(_sub_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT SUM(mp.amount) FROM public.mp_account_movements mp
    WHERE mp.suscripcion_id = _sub_id AND mp.status = 'approved'
  ), 0)
  + COALESCE((
    SELECT SUM(ca.monto) FROM public.cuenta_ajustes ca
    WHERE ca.tipo = 'credito'
      AND ca.aplicado_a_fuente_tabla = 'suscripciones'
      AND ca.aplicado_a_fuente_id = _sub_id
  ), 0)
  + CASE
      WHEN public.is_subscription_paid(_sub_id)
       AND NOT EXISTS (SELECT 1 FROM public.mp_account_movements mp WHERE mp.suscripcion_id = _sub_id AND mp.status = 'approved')
       AND NOT EXISTS (SELECT 1 FROM public.cuenta_ajustes ca WHERE ca.tipo='credito' AND ca.aplicado_a_fuente_tabla='suscripciones' AND ca.aplicado_a_fuente_id = _sub_id)
      THEN COALESCE((SELECT COALESCE(s.precio_final, s.precio_base, 0) FROM public.suscripciones s WHERE s.id = _sub_id), 0)
      ELSE 0
    END
$$;

-- 2) Vista cuenta corriente: precio congelado + haber por evidencia de pago
CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
 SELECT s.alumno_id,
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
    COALESCE(
        CASE WHEN s.origen_registro = ANY (ARRAY['automatico'::text, 'cargado_admin'::text]) THEN s.fecha_inicio ELSE NULL::date END,
        s.updated_at::date) AS fecha,
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
            WHEN EXISTS ( SELECT 1 FROM mp_account_movements mp WHERE mp.suscripcion_id = s.id AND mp.status = 'approved'::text)
              THEN COALESCE(( SELECT sum(mp.amount) FROM mp_account_movements mp WHERE mp.suscripcion_id = s.id AND mp.status = 'approved'::text), 0::numeric)
            ELSE COALESCE(s.precio_final, s.precio_base, p.precio, 0::numeric)
        END AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda,
    s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', s.metodo_pago, 'origen_registro', s.origen_registro, 'mp_payment_id', s.mp_payment_id, 'cuenta_mp_id', s.cuenta_mp_id, 'notas', s.notas, 'fecha_pago', s.fecha_inicio) AS referencia_extra
   FROM suscripciones s
     LEFT JOIN planes p ON p.id = s.plan_id
  WHERE s.cancelada_at IS NULL
    AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'finalizada'::text, 'conciliado'::text]))
    AND public.is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id)
UNION ALL
 SELECT er.alumno_id,
    COALESCE(er.confirmed_at::date, er.created_at::date) AS fecha,
    'cargo_reserva'::text AS tipo,
    COALESCE(e.title, 'Evento'::text) ||
        CASE WHEN er.package_nombre_snapshot IS NOT NULL THEN ' — '::text || er.package_nombre_snapshot ELSE ''::text END AS concepto,
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
        CASE WHEN rp.payment_method IS NOT NULL THEN (' ('::text || rp.payment_method) || ')'::text ELSE ''::text END AS concepto,
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
        CASE WHEN sp.forma_pago_sena IS NOT NULL THEN (' ('::text || sp.forma_pago_sena) || ')'::text ELSE ''::text END AS concepto,
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
        CASE WHEN so.metodo_pago IS NOT NULL THEN (' ('::text || so.metodo_pago) || ')'::text ELSE ''::text END AS concepto,
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
 SELECT ca.alumno_id, ca.fecha, 'ajuste_cargo'::text AS tipo, ca.concepto,
    'cuenta_ajustes'::text AS fuente_tabla, ca.id AS fuente_id, ca.monto AS debe, 0::numeric AS haber, ca.moneda,
    'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa) AS referencia_extra
   FROM cuenta_ajustes ca
  WHERE ca.tipo = 'cargo'::text
UNION ALL
 SELECT ca.alumno_id, ca.fecha, 'ajuste_credito'::text AS tipo,
    ca.concepto || CASE WHEN ca.aplicado_a_fuente_tabla = ANY (ARRAY['suscripciones'::text, 'event_reservations'::text]) THEN ' — aplicado'::text ELSE ''::text END AS concepto,
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
    ca.moneda, 'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa, 'aplicado_a_fuente_tabla', ca.aplicado_a_fuente_tabla, 'aplicado_a_fuente_id', ca.aplicado_a_fuente_id) AS referencia_extra
   FROM cuenta_ajustes ca
  WHERE ca.tipo = 'credito'::text;

-- 3) assign_mp_movement_to_target: método explícito + idempotencia + guardas
CREATE OR REPLACE FUNCTION public.assign_mp_movement_to_target(_movement_id uuid, _alumno_id uuid, _target_type text, _target_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
  v_res record;
  v_cargo record;
  v_event_currency text;
  v_payment_id uuid;
  v_existing uuid;
  v_credit_id uuid;
  v_note text;
  v_conflict uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _target_type = 'saldo' THEN
    RETURN public.assign_mp_movement_to_alumno(_movement_id, _alumno_id, _notes);
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
  IF v_mov.alumno_id IS NOT NULL AND v_mov.alumno_id <> _alumno_id THEN
    RAISE EXCEPTION 'already_assigned_to_other_student';
  END IF;
  IF v_mov.direccion IS DISTINCT FROM 'ingreso' THEN RAISE EXCEPTION 'only_income_movements_can_be_assigned'; END IF;
  IF v_mov.status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'only_approved_movements_can_be_assigned'; END IF;

  -- Guarda: un movimiento no puede estar imputado a dos obligaciones distintas
  IF _target_type = 'suscripcion' AND v_mov.reservation_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'movement_already_imputed_to_reservation';
  END IF;
  IF _target_type = 'reservation' AND v_mov.suscripcion_id IS NOT NULL AND v_mov.suscripcion_id <> _target_id THEN
    RAISE EXCEPTION 'movement_already_imputed_to_subscription';
  END IF;
  IF _target_type = 'suscripcion' AND v_mov.suscripcion_id IS NOT NULL AND v_mov.suscripcion_id <> _target_id THEN
    RAISE EXCEPTION 'movement_already_imputed_to_other_subscription';
  END IF;

  UPDATE public.mp_account_movements SET
    alumno_id = _alumno_id,
    assigned_manually = true,
    assigned_by = auth.uid(),
    assigned_at = now(),
    assign_notes = _notes
  WHERE id = _movement_id;

  IF _target_type = 'reservation' THEN
    SELECT r.*, COALESCE(r.currency_snapshot, e.currency, 'ARS') AS ev_currency
      INTO v_res
      FROM public.event_reservations r
      LEFT JOIN public.events e ON e.id = r.event_id
     WHERE r.id = _target_id
     FOR UPDATE OF r;
    IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
    v_event_currency := v_res.ev_currency;

    SELECT id INTO v_existing
      FROM public.reservation_payments
     WHERE reservation_id = _target_id
       AND anulado_at IS NULL
       AND (mp_payment_id = v_mov.mp_payment_id OR payment_reference = v_mov.mp_payment_id)
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.mp_account_movements SET reservation_payment_id = v_existing WHERE id = _movement_id;
      RETURN jsonb_build_object('created', false, 'payment_id', v_existing, 'skipped_reason', 'payment_already_linked');
    END IF;

    INSERT INTO public.reservation_payments (
      reservation_id, alumno_id, amount, currency, payment_date, payment_method,
      payment_reference, notes, status, reviewed_at, reviewed_by,
      original_amount, original_currency, event_currency,
      equivalent_amount_event_currency, cuenta_mp_id, mp_payment_id
    ) VALUES (
      _target_id, _alumno_id, ROUND(v_mov.amount::numeric, 2), COALESCE(v_mov.currency, 'ARS'),
      (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      'mercadopago', v_mov.mp_payment_id,
      COALESCE(_notes, 'Aplicado desde movimientos MP. Op ' || v_mov.mp_payment_id),
      'validado', now(), auth.uid(),
      ROUND(v_mov.amount::numeric, 2), COALESCE(v_mov.currency, 'ARS'), v_event_currency,
      CASE WHEN COALESCE(v_mov.currency, 'ARS') = v_event_currency THEN ROUND(v_mov.amount::numeric, 2) END,
      v_mov.cuenta_mp_id, v_mov.mp_payment_id
    ) RETURNING id INTO v_payment_id;

    UPDATE public.mp_account_movements SET reservation_payment_id = v_payment_id WHERE id = _movement_id;
    PERFORM public.recalculate_reservation_payment_totals(_target_id);

    RETURN jsonb_build_object('created', true, 'payment_id', v_payment_id, 'target', 'reservation');

  ELSIF _target_type = 'suscripcion' THEN
    -- Guarda: el mismo pago MP no puede quedar imputado a dos suscripciones
    SELECT id INTO v_conflict FROM public.suscripciones
     WHERE mp_payment_id = v_mov.mp_payment_id AND id <> _target_id AND cancelada_at IS NULL
     LIMIT 1;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'mp_payment_already_imputed_to_subscription %', v_conflict;
    END IF;

    v_note := 'Pago MP aplicado manualmente. Op ' || COALESCE(v_mov.mp_payment_id, '-');

    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones SET
      mp_payment_id = v_mov.mp_payment_id,
      mp_status = 'approved',
      metodo_pago = 'mercadopago',              -- explícito, sin COALESCE
      cuenta_mp_id = COALESCE(v_mov.cuenta_mp_id, cuenta_mp_id),
      estado = CASE WHEN estado IN ('pendiente', 'pendiente_verificacion', 'vencida') THEN 'activa' ELSE estado END,
      notas = CASE
                WHEN COALESCE(notas, '') LIKE '%' || v_note || '%' THEN notas
                ELSE COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE E'\n' END || v_note
              END,
      updated_at = now()
    WHERE id = _target_id AND alumno_id = _alumno_id;
    PERFORM set_config('app.sub_internal', 'off', true);

    IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

    UPDATE public.mp_account_movements SET suscripcion_id = _target_id WHERE id = _movement_id;
    RETURN jsonb_build_object('created', true, 'target', 'suscripcion');

  ELSIF _target_type = 'cargo' THEN
    SELECT * INTO v_cargo FROM public.cuenta_ajustes WHERE id = _target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cargo_not_found'; END IF;
    IF v_cargo.tipo <> 'cargo' THEN RAISE EXCEPTION 'target_is_not_a_charge'; END IF;
    IF v_cargo.alumno_id <> _alumno_id THEN RAISE EXCEPTION 'charge_of_other_student'; END IF;

    SELECT id INTO v_existing
      FROM public.cuenta_ajustes
     WHERE tipo = 'credito'
       AND alumno_id = _alumno_id
       AND referencia_externa IS NOT NULL
       AND referencia_externa = v_mov.mp_payment_id
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.cuenta_ajustes
         SET aplicado_a_fuente_tabla = 'cuenta_ajustes',
             aplicado_a_fuente_id = _target_id,
             updated_at = now()
       WHERE id = v_existing;
      RETURN jsonb_build_object('created', false, 'ajuste_id', v_existing, 'target', 'cargo');
    END IF;

    INSERT INTO public.cuenta_ajustes (
      alumno_id, tipo, concepto, monto, moneda, fecha, notas, created_by,
      medio_pago, cuenta_mp_id, referencia_externa,
      aplicado_a_fuente_tabla, aplicado_a_fuente_id
    ) VALUES (
      _alumno_id, 'credito',
      'Pago Mercado Pago aplicado a: ' || COALESCE(NULLIF(v_cargo.concepto, ''), 'cargo en cuenta corriente'),
      ROUND(v_mov.amount::numeric, 2), COALESCE(v_mov.currency, 'ARS'),
      (v_mov.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      COALESCE(_notes, 'Op ' || COALESCE(v_mov.mp_payment_id, '-')), auth.uid(),
      'mercadopago', v_mov.cuenta_mp_id, v_mov.mp_payment_id,
      'cuenta_ajustes', _target_id
    ) RETURNING id INTO v_credit_id;

    RETURN jsonb_build_object('created', true, 'ajuste_id', v_credit_id, 'target', 'cargo');
  END IF;

  RAISE EXCEPTION 'invalid_target_type';
END;
$function$;

-- 4) unassign_mp_movement: limpia también la obligación imputada
CREATE OR REPLACE FUNCTION public.unassign_mp_movement(_movement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov record;
  v_applied_count int;
  v_deleted int := 0;
  v_sub record;
  v_cleared_sub boolean := false;
  v_cleared_res boolean := false;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_mov FROM public.mp_account_movements WHERE id = _movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;

  -- Idempotente: nada que desasignar
  IF v_mov.alumno_id IS NULL AND v_mov.suscripcion_id IS NULL AND v_mov.reservation_payment_id IS NULL THEN
    RETURN jsonb_build_object('movement_id', _movement_id, 'unassigned', false);
  END IF;

  -- Crédito ya aplicado a una deuda: bloquear
  SELECT count(*) INTO v_applied_count
    FROM public.cuenta_ajustes
    WHERE referencia_externa = v_mov.mp_payment_id
      AND alumno_id = v_mov.alumno_id
      AND tipo = 'credito'
      AND aplicado_a_fuente_id IS NOT NULL;

  IF v_applied_count > 0 THEN
    RAISE EXCEPTION 'credit_already_applied_cannot_unassign';
  END IF;

  DELETE FROM public.cuenta_ajustes
    WHERE referencia_externa = v_mov.mp_payment_id
      AND alumno_id = v_mov.alumno_id
      AND tipo = 'credito'
      AND aplicado_a_fuente_id IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Limpiar la suscripción imputada por ESTE movimiento
  IF v_mov.suscripcion_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.suscripciones WHERE id = v_mov.suscripcion_id FOR UPDATE;
    IF FOUND THEN
      PERFORM set_config('app.sub_internal', 'on', true);
      UPDATE public.suscripciones s SET
        mp_payment_id = CASE WHEN s.mp_payment_id IS NOT DISTINCT FROM v_mov.mp_payment_id THEN NULL ELSE s.mp_payment_id END,
        mp_status     = CASE WHEN s.mp_payment_id IS NOT DISTINCT FROM v_mov.mp_payment_id THEN NULL ELSE s.mp_status END,
        metodo_pago   = CASE WHEN s.metodo_pago = 'mercadopago' THEN 'pendiente' ELSE s.metodo_pago END,
        estado        = CASE
                          WHEN s.estado IN ('activa', 'conciliado', 'finalizada')
                            THEN CASE WHEN COALESCE(s.fecha_fin, CURRENT_DATE) < CURRENT_DATE THEN 'vencida' ELSE 'pendiente' END
                          ELSE s.estado
                        END,
        notas = COALESCE(s.notas, '') || CASE WHEN COALESCE(s.notas, '') = '' THEN '' ELSE E'\n' END
                || '[' || to_char(now(), 'YYYY-MM-DD') || '] Se quitó la imputación del pago MP ' || COALESCE(v_mov.mp_payment_id, '-'),
        updated_at = now()
      WHERE s.id = v_mov.suscripcion_id
        -- No tocar si el pago tiene otra evidencia válida en esa suscripción
        AND NOT EXISTS (
          SELECT 1 FROM public.mp_account_movements m2
          WHERE m2.suscripcion_id = s.id AND m2.id <> _movement_id AND m2.status = 'approved'
        );
      GET DIAGNOSTICS v_applied_count = ROW_COUNT;
      v_cleared_sub := v_applied_count > 0;
      PERFORM set_config('app.sub_internal', 'off', true);
    END IF;
  END IF;

  -- Anular el pago de reserva creado por este movimiento
  IF v_mov.reservation_payment_id IS NOT NULL THEN
    UPDATE public.reservation_payments
       SET anulado_at = now(), status = 'anulado',
           notes = COALESCE(notes, '') || E'\n' || '[' || to_char(now(), 'YYYY-MM-DD') || '] Anulado al desasignar el movimiento MP'
     WHERE id = v_mov.reservation_payment_id AND anulado_at IS NULL;
    v_cleared_res := FOUND;
    PERFORM public.recalculate_reservation_payment_totals(
      (SELECT reservation_id FROM public.reservation_payments WHERE id = v_mov.reservation_payment_id)
    );
  END IF;

  UPDATE public.mp_account_movements SET
    alumno_id = NULL,
    suscripcion_id = NULL,
    reservation_payment_id = NULL,
    assigned_manually = false,
    assigned_by = NULL,
    assigned_at = NULL,
    assign_notes = NULL
  WHERE id = _movement_id;

  RETURN jsonb_build_object(
    'movement_id', _movement_id, 'unassigned', true,
    'ajustes_borrados', v_deleted,
    'suscripcion_limpiada', v_cleared_sub,
    'pago_reserva_anulado', v_cleared_res
  );
END;
$function$;

-- 5) cambiar_plan_suscripcion: coherencia plan/precio
CREATE OR REPLACE FUNCTION public.cambiar_plan_suscripcion(
  _suscripcion_id uuid,
  _nuevo_plan_id uuid,
  _motivo text,
  _usar_precio_del_nuevo_plan boolean DEFAULT true,
  _precio_excepcion numeric DEFAULT NULL,
  _excepcion_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_plan record;
  v_base numeric;
  v_final numeric;
  v_desc numeric;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = _suscripcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  SELECT * INTO v_plan FROM public.planes WHERE id = _nuevo_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  IF COALESCE(_motivo, '') = '' THEN RAISE EXCEPTION 'motivo_required'; END IF;

  IF _usar_precio_del_nuevo_plan THEN
    v_base := COALESCE(public.get_active_price_stage(_nuevo_plan_id), v_plan.precio, 0);
  ELSE
    IF _precio_excepcion IS NULL OR COALESCE(_excepcion_motivo, '') = '' THEN
      RAISE EXCEPTION 'price_exception_requires_amount_and_reason';
    END IF;
    v_base := _precio_excepcion;
  END IF;

  -- Conservar el descuento vigente (porcentaje sobre el precio base anterior)
  v_desc := CASE
    WHEN COALESCE(v_sub.precio_base, 0) > 0 AND v_sub.precio_final IS NOT NULL
      THEN GREATEST(0, LEAST(1, 1 - (v_sub.precio_final / v_sub.precio_base)))
    ELSE 0
  END;
  v_final := ROUND(v_base * (1 - v_desc), 2);

  PERFORM set_config('app.sub_internal', 'on', true);
  UPDATE public.suscripciones SET
    plan_id = _nuevo_plan_id,
    precio_base = v_base,
    precio_final = v_final,
    moneda = COALESCE(v_plan.moneda, moneda),
    notas = COALESCE(notas, '') || CASE WHEN COALESCE(notas, '') = '' THEN '' ELSE E'\n' END
            || '[' || to_char(now(), 'YYYY-MM-DD') || '] Corrección de plan → ' || v_plan.nombre
            || ' · ' || _motivo
            || CASE WHEN _usar_precio_del_nuevo_plan THEN '' ELSE ' · EXCEPCIÓN DE PRECIO: ' || _excepcion_motivo END,
    updated_at = now()
  WHERE id = _suscripcion_id;
  PERFORM set_config('app.sub_internal', 'off', true);

  INSERT INTO public.audit_log (user_id, accion, entidad, entidad_id, detalles)
  VALUES (auth.uid(), 'cambiar_plan_suscripcion', 'suscripciones', _suscripcion_id,
    jsonb_build_object(
      'plan_anterior', v_sub.plan_id, 'plan_nuevo', _nuevo_plan_id,
      'precio_base_anterior', v_sub.precio_base, 'precio_final_anterior', v_sub.precio_final,
      'precio_base_nuevo', v_base, 'precio_final_nuevo', v_final,
      'motivo', _motivo, 'excepcion', NOT _usar_precio_del_nuevo_plan, 'excepcion_motivo', _excepcion_motivo));

  RETURN jsonb_build_object('ok', true, 'precio_base', v_base, 'precio_final', v_final, 'moneda', COALESCE(v_plan.moneda, v_sub.moneda));
END;
$function$;

-- 6) get_alumno_payment_targets: deudas reales con saldo
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
  v_emails text[];
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT lower(trim(x)) FROM (
      SELECT a.email AS x FROM public.alumnos a WHERE a.id = _alumno_id
      UNION ALL
      SELECT unnest(COALESCE(a.emails_adicionales, ARRAY[]::text[])) FROM public.alumnos a WHERE a.id = _alumno_id
    ) t WHERE x IS NOT NULL AND trim(x) <> ''
  ) INTO v_emails;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'fecha' DESC), '[]'::jsonb) INTO v_reservations
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'label', COALESCE(e.title, 'Evento'),
      'currency', COALESCE(r.currency_snapshot, e.currency, 'ARS'),
      'total', COALESCE(r.amount_total, 0),
      'paid', COALESCE(r.amount_paid, 0),
      'balance', COALESCE(r.balance_due, 0),
      'estado', r.reservation_status,
      'fecha', COALESCE(e.date::text, r.created_at::date::text)
    ) AS x
    FROM public.event_reservations r
    LEFT JOIN public.events e ON e.id = r.event_id
    LEFT JOIN public.event_external_participants ep ON ep.id = r.external_participant_id
    WHERE (
        r.alumno_id = _alumno_id
        OR (r.alumno_id IS NULL AND lower(trim(COALESCE(r.external_email, ep.email, ''))) = ANY(v_emails))
      )
      AND COALESCE(r.estado, '') NOT IN ('cancelada', 'cancelado', 'rechazada', 'expirada')
      AND COALESCE(r.balance_due, 0) > 0.01
  ) s;

  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'fecha' DESC), '[]'::jsonb) INTO v_subs
  FROM (
    SELECT jsonb_build_object(
      'id', su.id,
      'label', COALESCE(p.nombre, 'Plan'),
      'currency', COALESCE(su.moneda, p.moneda, 'ARS'),
      'total', COALESCE(su.precio_final, su.precio_base, p.precio, 0),
      'paid', public.subscription_paid_amount(su.id),
      'balance', COALESCE(su.precio_final, su.precio_base, p.precio, 0) - public.subscription_paid_amount(su.id),
      'estado', su.estado,
      'fecha', su.fecha_inicio::text,
      'periodo', to_char(su.fecha_inicio, 'YYYY-MM'),
      'mp_candidate', (
        SELECT jsonb_build_object('mp_payment_id', mp.mp_payment_id, 'amount', mp.amount, 'fecha', mp.fecha_movimiento)
        FROM public.mp_account_movements mp
        WHERE mp.alumno_id = _alumno_id
          AND mp.status = 'approved'
          AND mp.suscripcion_id IS NULL
          AND mp.reservation_payment_id IS NULL
          AND ABS(mp.amount - COALESCE(su.precio_final, su.precio_base, 0)) < 1
        ORDER BY mp.fecha_movimiento DESC LIMIT 1
      )
    ) AS y
    FROM public.suscripciones su
    LEFT JOIN public.planes p ON p.id = su.plan_id
    WHERE su.alumno_id = _alumno_id
      AND su.cancelada_at IS NULL
      AND su.estado IN ('pendiente', 'pendiente_verificacion', 'vencida', 'activa')
      AND (COALESCE(su.precio_final, su.precio_base, p.precio, 0) - public.subscription_paid_amount(su.id)) > 0.01
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

-- 7) Guarda: impedir que dos suscripciones vivas compartan el mismo mp_payment_id
CREATE OR REPLACE FUNCTION public.guard_unique_mp_payment_on_suscripcion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_other uuid;
BEGIN
  IF NEW.mp_payment_id IS NULL OR NEW.cancelada_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.mp_payment_id IS NOT DISTINCT FROM OLD.mp_payment_id THEN RETURN NEW; END IF;

  SELECT id INTO v_other FROM public.suscripciones
   WHERE mp_payment_id = NEW.mp_payment_id AND id <> NEW.id AND cancelada_at IS NULL
   LIMIT 1;
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'mp_payment_already_imputed_to_subscription %', v_other;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_unique_mp_payment_on_suscripcion ON public.suscripciones;
CREATE TRIGGER trg_guard_unique_mp_payment_on_suscripcion
BEFORE INSERT OR UPDATE OF mp_payment_id ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.guard_unique_mp_payment_on_suscripcion();

-- Guarda: un movimiento MP no puede apuntar a dos obligaciones a la vez
CREATE OR REPLACE FUNCTION public.guard_mp_movement_single_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.suscripcion_id IS NOT NULL AND NEW.reservation_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'movement_cannot_target_subscription_and_reservation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_mp_movement_single_target ON public.mp_account_movements;
CREATE TRIGGER trg_guard_mp_movement_single_target
BEFORE INSERT OR UPDATE ON public.mp_account_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_mp_movement_single_target();