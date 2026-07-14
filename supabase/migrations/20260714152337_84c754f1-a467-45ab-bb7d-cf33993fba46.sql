
-- ============================================================
-- 1) Columnas de vinculación en cuenta_ajustes
-- ============================================================
ALTER TABLE public.cuenta_ajustes
  ADD COLUMN IF NOT EXISTS aplicado_a_fuente_tabla text,
  ADD COLUMN IF NOT EXISTS aplicado_a_fuente_id uuid;

CREATE INDEX IF NOT EXISTS idx_cuenta_ajustes_aplicado_a
  ON public.cuenta_ajustes(aplicado_a_fuente_tabla, aplicado_a_fuente_id)
  WHERE aplicado_a_fuente_id IS NOT NULL;

-- ============================================================
-- 2) Recrear vw_cuenta_corriente_movimientos (redirige ajustes-crédito aplicados)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
  SELECT s.alumno_id, COALESCE(s.fecha_inicio, (s.created_at)::date) AS fecha,
    'cargo_suscripcion'::text AS tipo,
    ('Plan: '::text || COALESCE(p.nombre, '—'::text)) AS concepto,
    'suscripciones'::text AS fuente_tabla, s.id AS fuente_id,
    CASE WHEN ((s.metodo_pago IS NOT NULL) AND (s.metodo_pago <> 'pendiente'::text))
           THEN COALESCE(s.precio_final, s.precio_base, p.precio, (0)::numeric)
         ELSE COALESCE(p.precio, s.precio_final, s.precio_base, (0)::numeric) END AS debe,
    (0)::numeric AS haber, COALESCE(p.moneda, 'ARS'::text) AS moneda, s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre) AS referencia_extra
  FROM (suscripciones s LEFT JOIN planes p ON ((p.id = s.plan_id)))
  WHERE ((s.cancelada_at IS NULL) AND (s.estado <> 'cancelada'::text))
UNION ALL
  SELECT s.alumno_id,
    COALESCE(CASE WHEN (s.origen_registro = ANY (ARRAY['automatico'::text, 'cargado_admin'::text]))
                    THEN s.fecha_inicio ELSE NULL::date END, (s.updated_at)::date) AS fecha,
    'pago_suscripcion'::text AS tipo,
    (('Pago plan: '::text || COALESCE(p.nombre, '—'::text)) ||
      CASE WHEN (s.metodo_pago IS NOT NULL) THEN ((' ('::text || s.metodo_pago) || ')'::text)
           ELSE ''::text END) AS concepto,
    'suscripciones'::text AS fuente_tabla, s.id AS fuente_id,
    (0)::numeric AS debe,
    COALESCE(s.precio_final, s.precio_base, p.precio, (0)::numeric) AS haber,
    COALESCE(p.moneda, 'ARS'::text) AS moneda, s.estado,
    jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre, 'metodo_pago', s.metodo_pago, 'origen_registro', s.origen_registro, 'mp_payment_id', s.mp_payment_id, 'cuenta_mp_id', s.cuenta_mp_id, 'notas', s.notas, 'fecha_pago', s.fecha_inicio) AS referencia_extra
  FROM (suscripciones s LEFT JOIN planes p ON ((p.id = s.plan_id)))
  WHERE ((s.cancelada_at IS NULL) AND (s.metodo_pago IS NOT NULL)
    AND (s.estado = ANY (ARRAY['activa'::text, 'pendiente_verificacion'::text, 'vencida'::text, 'finalizada'::text, 'conciliado'::text]))
    AND (s.origen_registro = ANY (ARRAY['automatico'::text, 'cargado_admin'::text])))
UNION ALL
  SELECT er.alumno_id, COALESCE((er.confirmed_at)::date, (er.created_at)::date) AS fecha,
    'cargo_reserva'::text AS tipo,
    (COALESCE(e.title, 'Evento'::text) ||
      CASE WHEN (er.package_nombre_snapshot IS NOT NULL) THEN (' — '::text || er.package_nombre_snapshot)
           ELSE ''::text END) AS concepto,
    'event_reservations'::text AS fuente_tabla, er.id AS fuente_id,
    COALESCE(er.amount_total, er.price_snapshot, er.monto, (0)::numeric) AS debe,
    (0)::numeric AS haber,
    COALESCE(er.currency_snapshot, er.moneda, e.currency, 'ARS'::text) AS moneda,
    er.reservation_status AS estado,
    jsonb_build_object('event_id', er.event_id, 'event_title', e.title, 'package_id', er.package_id, 'amount_total', er.amount_total, 'amount_paid', er.amount_paid, 'balance_due', er.balance_due, 'payment_plan_id', er.payment_plan_id) AS referencia_extra
  FROM (event_reservations er LEFT JOIN events e ON ((e.id = er.event_id)))
  WHERE ((er.alumno_id IS NOT NULL) AND (er.cancelled_at IS NULL) AND (COALESCE(er.reservation_status, 'pendiente'::text) <> 'cancelada'::text))
UNION ALL
  SELECT rp.alumno_id, COALESCE(rp.payment_date, (rp.created_at)::date) AS fecha,
    'pago_reserva'::text AS tipo,
    (('Pago '::text || COALESCE(e.title, 'Evento'::text)) ||
      CASE WHEN (rp.payment_method IS NOT NULL) THEN ((' ('::text || rp.payment_method) || ')'::text)
           ELSE ''::text END) AS concepto,
    'reservation_payments'::text AS fuente_tabla, rp.id AS fuente_id,
    (0)::numeric AS debe,
    COALESCE(rp.equivalent_amount_event_currency, rp.amount, (0)::numeric) AS haber,
    COALESCE(rp.event_currency, rp.currency, 'ARS'::text) AS moneda, rp.status AS estado,
    jsonb_build_object('reservation_id', rp.reservation_id, 'event_id', er.event_id, 'event_title', e.title, 'payment_method', rp.payment_method, 'installment_id', rp.installment_id, 'installment_number', rp.installment_number, 'original_amount', rp.original_amount, 'original_currency', rp.original_currency, 'cuenta_mp_id', rp.cuenta_mp_id, 'referencia_externa', rp.payment_reference, 'comprobante_url', rp.proof_url, 'notas', rp.notes, 'fecha_pago', rp.payment_date) AS referencia_extra
  FROM ((reservation_payments rp
    LEFT JOIN event_reservations er ON ((er.id = rp.reservation_id)))
    LEFT JOIN events e ON ((e.id = er.event_id)))
  WHERE ((rp.alumno_id IS NOT NULL) AND (rp.status = 'validado'::text) AND (rp.anulado_at IS NULL))
UNION ALL
  SELECT sp.alumno_id, (sp.created_at)::date AS fecha, 'cargo_preventa'::text AS tipo,
    ('Preventa: '::text || COALESCE(sp.producto_nombre, '—'::text)) AS concepto,
    'store_preorders'::text AS fuente_tabla, sp.id AS fuente_id,
    COALESCE(sp.precio_total, (sp.precio_unitario * (COALESCE(sp.cantidad, 1))::numeric), (0)::numeric) AS debe,
    (0)::numeric AS haber, COALESCE(sp.moneda, 'ARS'::text) AS moneda, sp.estado,
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'cantidad', sp.cantidad, 'variante', sp.variante, 'sena_monto', sp.sena_monto, 'saldo_pendiente', sp.saldo_pendiente, 'estado_pago_sena', sp.estado_pago_sena) AS referencia_extra
  FROM store_preorders sp
  WHERE ((sp.alumno_id IS NOT NULL) AND (sp.cancelada_at IS NULL) AND (COALESCE(sp.estado, ''::text) <> 'cancelada'::text))
UNION ALL
  SELECT sp.alumno_id, COALESCE((sp.sena_pagada_at)::date, (sp.updated_at)::date) AS fecha,
    'pago_preventa'::text AS tipo,
    (('Seña preventa: '::text || COALESCE(sp.producto_nombre, '—'::text)) ||
      CASE WHEN (sp.forma_pago_sena IS NOT NULL) THEN ((' ('::text || sp.forma_pago_sena) || ')'::text)
           ELSE ''::text END) AS concepto,
    'store_preorders'::text AS fuente_tabla, sp.id AS fuente_id,
    (0)::numeric AS debe, COALESCE(sp.sena_monto, (0)::numeric) AS haber,
    COALESCE(sp.moneda, 'ARS'::text) AS moneda, 'sena_pagada'::text AS estado,
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'forma_pago_sena', sp.forma_pago_sena, 'mp_payment_id', sp.mp_payment_id, 'cuenta_mp_id', sp.cuenta_mp_id, 'notas', sp.notas, 'fecha_pago', sp.sena_pagada_at, 'tipo_pago', 'sena') AS referencia_extra
  FROM store_preorders sp
  WHERE ((sp.alumno_id IS NOT NULL) AND (sp.cancelada_at IS NULL) AND (sp.estado_pago_sena = ANY (ARRAY['pagado'::text, 'aprobado'::text, 'pagada'::text, 'confirmada'::text])) AND (COALESCE(sp.sena_monto, (0)::numeric) > (0)::numeric))
UNION ALL
  SELECT sp.alumno_id, COALESCE((sp.entregada_at)::date, (sp.updated_at)::date) AS fecha,
    'pago_preventa'::text AS tipo,
    ('Saldo final preventa: '::text || COALESCE(sp.producto_nombre, '—'::text)) AS concepto,
    'store_preorders'::text AS fuente_tabla, sp.id AS fuente_id,
    (0)::numeric AS debe,
    GREATEST((COALESCE(sp.precio_total, (0)::numeric) - COALESCE(sp.sena_monto, (0)::numeric)), (0)::numeric) AS haber,
    COALESCE(sp.moneda, 'ARS'::text) AS moneda, COALESCE(sp.estado, 'completada'::text) AS estado,
    jsonb_build_object('product_id', sp.product_id, 'producto_nombre', sp.producto_nombre, 'cuenta_mp_id', sp.cuenta_mp_id, 'fecha_pago', sp.entregada_at, 'tipo_pago', 'saldo_final') AS referencia_extra
  FROM store_preorders sp
  WHERE ((sp.alumno_id IS NOT NULL) AND (sp.cancelada_at IS NULL) AND (COALESCE(sp.saldo_pendiente, (0)::numeric) <= (0)::numeric) AND (COALESCE(sp.precio_total, (0)::numeric) > COALESCE(sp.sena_monto, (0)::numeric)))
UNION ALL
  SELECT so.alumno_id, (so.created_at)::date AS fecha, 'cargo_tienda'::text AS tipo,
    ('Tienda — Orden #'::text || COALESCE((so.order_number)::text, (so.id)::text)) AS concepto,
    'store_orders'::text AS fuente_tabla, so.id AS fuente_id,
    COALESCE(so.total, (0)::numeric) AS debe, (0)::numeric AS haber,
    COALESCE(so.currency, 'ARS'::text) AS moneda, so.status AS estado,
    jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id) AS referencia_extra
  FROM store_orders so
  WHERE ((so.alumno_id IS NOT NULL) AND (COALESCE(so.status, ''::text) <> 'cancelada'::text))
UNION ALL
  SELECT so.alumno_id, COALESCE((so.pagado_at)::date, (so.updated_at)::date) AS fecha,
    'pago_tienda'::text AS tipo,
    (('Pago tienda — Orden #'::text || COALESCE((so.order_number)::text, (so.id)::text)) ||
      CASE WHEN (so.metodo_pago IS NOT NULL) THEN ((' ('::text || so.metodo_pago) || ')'::text)
           ELSE ''::text END) AS concepto,
    'store_orders'::text AS fuente_tabla, so.id AS fuente_id,
    (0)::numeric AS debe, COALESCE(so.total, (0)::numeric) AS haber,
    COALESCE(so.currency, 'ARS'::text) AS moneda, so.status AS estado,
    jsonb_build_object('order_number', so.order_number, 'metodo_pago', so.metodo_pago, 'mp_payment_id', so.mp_payment_id, 'cuenta_mp_id', so.cuenta_mp_id, 'referencia_externa', so.mp_external_reference, 'notas', so.notes, 'fecha_pago', so.pagado_at) AS referencia_extra
  FROM store_orders so
  WHERE ((so.alumno_id IS NOT NULL) AND ((so.pagado_at IS NOT NULL) OR (so.status = ANY (ARRAY['pagada'::text, 'pagado'::text, 'completada'::text, 'entregada'::text]))))
UNION ALL
  SELECT ca.alumno_id, ca.fecha, 'ajuste_cargo'::text AS tipo, ca.concepto,
    'cuenta_ajustes'::text AS fuente_tabla, ca.id AS fuente_id,
    ca.monto AS debe, (0)::numeric AS haber, ca.moneda, 'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa) AS referencia_extra
  FROM cuenta_ajustes ca WHERE (ca.tipo = 'cargo'::text)
UNION ALL
  SELECT ca.alumno_id, ca.fecha, 'ajuste_credito'::text AS tipo, ca.concepto,
    COALESCE(ca.aplicado_a_fuente_tabla, 'cuenta_ajustes')::text AS fuente_tabla,
    COALESCE(ca.aplicado_a_fuente_id, ca.id) AS fuente_id,
    (0)::numeric AS debe, ca.monto AS haber, ca.moneda, 'registrado'::text AS estado,
    jsonb_build_object('notas', ca.notas, 'created_by', ca.created_by, 'medio_pago', ca.medio_pago, 'cuenta_mp_id', ca.cuenta_mp_id, 'referencia_externa', ca.referencia_externa, 'aplicado_a_fuente_tabla', ca.aplicado_a_fuente_tabla, 'aplicado_a_fuente_id', ca.aplicado_a_fuente_id) AS referencia_extra
  FROM cuenta_ajustes ca WHERE (ca.tipo = 'credito'::text);

-- ============================================================
-- 3) Triggers de expiración: finalizada vs vencida
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_expire_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_categoria text;
BEGIN
  IF NEW.estado='activa' AND NEW.cancelada_at IS NULL
     AND NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < CURRENT_DATE THEN
    SELECT categoria INTO v_categoria FROM public.planes WHERE id = NEW.plan_id;
    IF COALESCE(v_categoria,'') <> 'pausa' THEN
      IF NEW.metodo_pago IS NOT NULL AND NEW.metodo_pago <> 'pendiente' THEN
        NEW.estado := 'finalizada';
      ELSE
        NEW.estado := 'vencida';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.expire_stale_subscriptions_for_alumno(p_alumno_id uuid, p_plan_id uuid DEFAULT NULL::uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_count integer := 0;
BEGIN
  IF p_alumno_id IS NULL THEN RETURN 0; END IF;
  WITH updated AS (
    UPDATE public.suscripciones s
    SET estado = CASE WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'
                        THEN 'finalizada' ELSE 'vencida' END,
        updated_at = now()
    FROM public.planes p
    WHERE s.plan_id = p.id AND s.alumno_id = p_alumno_id
      AND (p_plan_id IS NULL OR s.plan_id = p_plan_id)
      AND s.estado = 'activa' AND s.cancelada_at IS NULL
      AND s.fecha_fin IS NOT NULL AND s.fecha_fin < CURRENT_DATE
      AND COALESCE(p.categoria,'') <> 'pausa'
    RETURNING s.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.close_previous_subscription_on_new()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado')
     AND NEW.cancelada_at IS NULL THEN
    UPDATE public.suscripciones
    SET estado = CASE WHEN metodo_pago IS NOT NULL AND metodo_pago <> 'pendiente'
                        THEN 'finalizada' ELSE 'vencida' END,
        updated_at = now()
    WHERE alumno_id = NEW.alumno_id AND plan_id = NEW.plan_id AND id <> NEW.id
      AND estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado')
      AND cancelada_at IS NULL AND fecha_fin < CURRENT_DATE
      AND (NEW.fecha_inicio IS NULL OR fecha_fin < NEW.fecha_inicio);
  END IF;
  RETURN NEW;
END; $function$;

-- ============================================================
-- 4) Backfill vencida→finalizada (bypass guard)
-- ============================================================
ALTER TABLE public.suscripciones DISABLE TRIGGER trg_guard_suscripcion_student_update;

UPDATE public.suscripciones s
SET estado = 'finalizada', updated_at = now()
WHERE s.estado = 'vencida'
  AND s.cancelada_at IS NULL
  AND s.metodo_pago IS NOT NULL
  AND s.metodo_pago <> 'pendiente';

ALTER TABLE public.suscripciones ENABLE TRIGGER trg_guard_suscripcion_student_update;

-- ============================================================
-- 5) Helper: deudas raw por alumno (usado por get_cuenta_publica)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_cuenta_publica_deudas_raw(p_alumno_id uuid)
RETURNS TABLE (moneda text, por_pagar numeric)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH pagos AS (
    SELECT fuente_tabla, fuente_id, SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = p_alumno_id AND haber > 0
    GROUP BY fuente_tabla, fuente_id
  )
  SELECT COALESCE(p.moneda,'ARS')::text,
    (CASE WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'
            THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0)
          ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0) END - COALESCE(pg.pagado, 0))::numeric
  FROM public.suscripciones s
  JOIN public.planes p ON p.id = s.plan_id
  LEFT JOIN pagos pg ON pg.fuente_tabla='suscripciones' AND pg.fuente_id = s.id
  WHERE s.alumno_id = p_alumno_id AND s.cancelada_at IS NULL
    AND s.estado NOT IN ('cancelada','finalizada')
    AND (CASE WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'
                THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0)
              ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0) END - COALESCE(pg.pagado, 0)) > 0.01
  UNION ALL
  SELECT ri.currency::text, ri.balance_due::numeric
  FROM public.reservation_installments ri
  JOIN public.event_reservations er ON er.id = ri.reservation_id
  WHERE er.alumno_id = p_alumno_id AND ri.condoned_at IS NULL
    AND ri.status IN ('pendiente','parcial','vencida') AND ri.balance_due > 0.01
    AND er.cancelled_at IS NULL AND COALESCE(er.reservation_status,'pendiente') <> 'cancelada'
  UNION ALL
  SELECT COALESCE(so.currency,'ARS')::text, (so.total - COALESCE(pg.pagado,0))::numeric
  FROM public.store_orders so
  LEFT JOIN (
    SELECT fuente_id, SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = p_alumno_id AND haber > 0 AND fuente_tabla='store_orders'
    GROUP BY fuente_id
  ) pg ON pg.fuente_id = so.id
  WHERE so.alumno_id = p_alumno_id
    AND so.status IN ('pendiente_pago','pendiente_verificacion')
    AND (so.total - COALESCE(pg.pagado, 0)) > 0.01
  UNION ALL
  SELECT COALESCE(sp.moneda,'ARS')::text, sp.saldo_pendiente::numeric
  FROM public.store_preorders sp
  WHERE sp.alumno_id = p_alumno_id AND sp.cancelada_at IS NULL
    AND sp.estado NOT IN ('cancelada','entregada') AND sp.saldo_pendiente > 0.01;
$function$;

-- ============================================================
-- 6) get_cuenta_publica: aplica saldo a favor virtualmente + pagos recientes
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_cuenta_publica(p_token uuid, p_user_agent text DEFAULT NULL::text, p_ip text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_token_row public.cuenta_corriente_tokens%ROWTYPE;
  v_alumno record; v_saludo text;
  v_deudas jsonb; v_creditos jsonb; v_pagos jsonb;
BEGIN
  SELECT * INTO v_token_row FROM public.cuenta_corriente_tokens WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'reason','not_found'); END IF;
  IF v_token_row.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('valid', false, 'reason','revoked'); END IF;
  IF v_token_row.expires_at IS NOT NULL AND v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason','expired');
  END IF;

  UPDATE public.cuenta_corriente_tokens
  SET last_accessed_at = now(), access_count = access_count + 1,
      last_user_agent = COALESCE(p_user_agent, last_user_agent),
      last_ip = COALESCE(p_ip, last_ip)
  WHERE id = v_token_row.id;

  SELECT nombre, apellido INTO v_alumno FROM public.alumnos WHERE id = v_token_row.alumno_id;
  v_saludo := COALESCE(v_alumno.nombre,'') ||
              CASE WHEN v_alumno.apellido IS NOT NULL AND length(v_alumno.apellido) > 0
                   THEN ' ' || upper(left(v_alumno.apellido,1)) || '.' ELSE '' END;

  WITH pagos AS (
    SELECT fuente_tabla, fuente_id, SUM(haber)::numeric AS pagado
    FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = v_token_row.alumno_id AND haber > 0
    GROUP BY fuente_tabla, fuente_id
  ),
  subs AS (
    SELECT 'suscripcion'::text AS tipo, s.id::text AS ref_id,
      COALESCE(p.nombre,'Plan') ||
        CASE WHEN s.fecha_inicio IS NOT NULL THEN ' — ' || to_char(s.fecha_inicio,'TMMonth YYYY') ELSE '' END AS concepto,
      s.fecha_fin AS due_date,
      CASE WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'
             THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0)::numeric
           ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0)::numeric END AS total,
      COALESCE(pg.pagado,0)::numeric AS pagado,
      (CASE WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'
              THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0)
            ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0) END - COALESCE(pg.pagado,0))::numeric AS por_pagar,
      COALESCE(p.moneda,'ARS') AS moneda, s.estado AS estado, true AS mp_disponible,
      jsonb_build_object('plan_id', s.plan_id, 'alumno_id', s.alumno_id, 'suscripcion_id', s.id) AS payment_payload
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    LEFT JOIN pagos pg ON pg.fuente_tabla='suscripciones' AND pg.fuente_id = s.id
    WHERE s.alumno_id = v_token_row.alumno_id AND s.cancelada_at IS NULL
      AND s.estado NOT IN ('cancelada','finalizada')
      AND (CASE WHEN s.metodo_pago IS NOT NULL AND s.metodo_pago <> 'pendiente'
                  THEN COALESCE(s.precio_final, s.precio_base, p.precio, 0)
                ELSE COALESCE(p.precio, s.precio_final, s.precio_base, 0) END - COALESCE(pg.pagado,0)) > 0.01
  ),
  cuotas AS (
    SELECT 'evento_cuota'::text AS tipo, ri.id::text AS ref_id,
      COALESCE(e.title,'Evento') || ' — ' || ri.label AS concepto,
      ri.due_date AS due_date, ri.amount::numeric AS total,
      ri.paid_amount::numeric AS pagado, ri.balance_due::numeric AS por_pagar,
      ri.currency AS moneda, ri.status AS estado, true AS mp_disponible,
      jsonb_build_object('reservation_id', ri.reservation_id,'installment_number', ri.installment_number,'amount', ri.balance_due,'installment_id', ri.id) AS payment_payload
    FROM public.reservation_installments ri
    JOIN public.event_reservations er ON er.id = ri.reservation_id
    JOIN public.events e ON e.id = er.event_id
    WHERE er.alumno_id = v_token_row.alumno_id AND ri.condoned_at IS NULL
      AND ri.status IN ('pendiente','parcial','vencida') AND ri.balance_due > 0.01
      AND er.cancelled_at IS NULL AND COALESCE(er.reservation_status,'pendiente') <> 'cancelada'
  ),
  reservas_sin_cuotas AS (
    SELECT 'evento_cuota'::text AS tipo, er.id::text AS ref_id,
      COALESCE(e.title,'Evento') ||
        CASE WHEN er.package_nombre_snapshot IS NOT NULL THEN ' — ' || er.package_nombre_snapshot ELSE '' END AS concepto,
      COALESCE(er.next_due_date, er.created_at::date) AS due_date,
      COALESCE(er.amount_total, er.price_snapshot, er.monto, 0)::numeric AS total,
      COALESCE(pg.pagado, er.amount_paid, 0)::numeric AS pagado,
      (COALESCE(er.amount_total, er.price_snapshot, er.monto, 0) - COALESCE(pg.pagado, er.amount_paid, 0))::numeric AS por_pagar,
      COALESCE(er.currency_snapshot, er.moneda, e.currency,'ARS') AS moneda,
      er.reservation_status AS estado, true AS mp_disponible,
      jsonb_build_object('reservation_id', er.id, 'amount', (COALESCE(er.amount_total, er.price_snapshot, er.monto, 0) - COALESCE(pg.pagado, er.amount_paid, 0))) AS payment_payload
    FROM public.event_reservations er
    JOIN public.events e ON e.id = er.event_id
    LEFT JOIN pagos pg ON pg.fuente_tabla='reservation_payments' AND pg.fuente_id = er.id
    WHERE er.alumno_id = v_token_row.alumno_id AND er.cancelled_at IS NULL
      AND COALESCE(er.reservation_status,'pendiente') <> 'cancelada'
      AND NOT EXISTS (
        SELECT 1 FROM public.reservation_installments ri
        WHERE ri.reservation_id = er.id AND ri.condoned_at IS NULL AND ri.balance_due > 0.01
      )
      AND (COALESCE(er.amount_total, er.price_snapshot, er.monto, 0) - COALESCE(pg.pagado, er.amount_paid, 0)) > 0.01
  ),
  ordenes AS (
    SELECT 'tienda'::text AS tipo, so.id::text AS ref_id,
      'Pedido tienda #' || so.order_number AS concepto,
      so.created_at::date AS due_date, so.total::numeric AS total,
      COALESCE(pg.pagado,0)::numeric AS pagado,
      (so.total - COALESCE(pg.pagado,0))::numeric AS por_pagar,
      so.currency AS moneda, so.status AS estado, true AS mp_disponible,
      jsonb_build_object('order_id', so.id) AS payment_payload
    FROM public.store_orders so
    LEFT JOIN pagos pg ON pg.fuente_tabla='store_orders' AND pg.fuente_id = so.id
    WHERE so.alumno_id = v_token_row.alumno_id
      AND so.status IN ('pendiente_pago','pendiente_verificacion')
      AND (so.total - COALESCE(pg.pagado,0)) > 0.01
  ),
  preventas AS (
    SELECT 'preventa'::text AS tipo, sp.id::text AS ref_id,
      'Preventa: ' || sp.producto_nombre AS concepto,
      sp.created_at::date AS due_date, sp.precio_total::numeric AS total,
      (sp.precio_total - sp.saldo_pendiente)::numeric AS pagado,
      sp.saldo_pendiente::numeric AS por_pagar,
      sp.moneda AS moneda, sp.estado AS estado, true AS mp_disponible,
      jsonb_build_object('preorder_id', sp.id) AS payment_payload
    FROM public.store_preorders sp
    WHERE sp.alumno_id = v_token_row.alumno_id AND sp.cancelada_at IS NULL
      AND sp.estado NOT IN ('cancelada','entregada') AND sp.saldo_pendiente > 0.01
  ),
  todas AS (
    SELECT * FROM subs UNION ALL SELECT * FROM cuotas UNION ALL SELECT * FROM reservas_sin_cuotas
    UNION ALL SELECT * FROM ordenes UNION ALL SELECT * FROM preventas
  ),
  credit_pool AS (
    SELECT moneda, SUM(monto)::numeric AS pool
    FROM public.cuenta_ajustes
    WHERE alumno_id = v_token_row.alumno_id AND tipo='credito' AND aplicado_a_fuente_id IS NULL
    GROUP BY moneda
  ),
  distrib AS (
    SELECT t.*,
      LEAST(t.por_pagar,
            GREATEST(0,
              COALESCE((SELECT pool FROM credit_pool cp WHERE cp.moneda = t.moneda),0)
              - COALESCE(SUM(t.por_pagar) OVER (
                  PARTITION BY t.moneda
                  ORDER BY t.due_date NULLS LAST, t.ref_id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ),0)
            )
      ) AS credito_aplicado
    FROM todas t
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'tipo', d.tipo, 'ref_id', d.ref_id, 'concepto', d.concepto,
      'due_date', d.due_date, 'total', d.total, 'pagado', d.pagado,
      'por_pagar', d.por_pagar,
      'credito_aplicado', d.credito_aplicado,
      'por_pagar_neto', (d.por_pagar - d.credito_aplicado),
      'moneda', d.moneda, 'estado', d.estado, 'mp_disponible', d.mp_disponible,
      'payment_payload', d.payment_payload
    )
    ORDER BY d.due_date NULLS LAST, d.ref_id
  ), '[]'::jsonb) INTO v_deudas FROM distrib d;

  WITH pool_por_moneda AS (
    SELECT moneda, SUM(monto)::numeric AS pool
    FROM public.cuenta_ajustes
    WHERE alumno_id = v_token_row.alumno_id AND tipo='credito' AND aplicado_a_fuente_id IS NULL
    GROUP BY moneda
  ),
  usado AS (
    SELECT moneda, SUM(por_pagar)::numeric AS deuda
    FROM public.get_cuenta_publica_deudas_raw(v_token_row.alumno_id)
    GROUP BY moneda
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('moneda', p.moneda, 'monto', GREATEST(p.pool - COALESCE(u.deuda,0), 0))), '[]'::jsonb)
  INTO v_creditos
  FROM pool_por_moneda p LEFT JOIN usado u ON u.moneda = p.moneda
  WHERE (p.pool - COALESCE(u.deuda,0)) > 0.01;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
  INTO v_pagos
  FROM (
    SELECT jsonb_build_object(
      'fecha', m.fecha, 'concepto', m.concepto, 'monto', m.haber,
      'moneda', m.moneda, 'tipo', m.tipo
    ) AS x
    FROM public.vw_cuenta_corriente_movimientos m
    WHERE m.alumno_id = v_token_row.alumno_id AND m.haber > 0
      AND m.tipo NOT IN ('ajuste_credito')  -- excluye la fila virtual de aplicación de crédito
    ORDER BY m.fecha DESC NULLS LAST
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'valid', true, 'saludo', v_saludo,
    'deudas', COALESCE(v_deudas,'[]'::jsonb),
    'creditos', COALESCE(v_creditos,'[]'::jsonb),
    'pagos', COALESCE(v_pagos,'[]'::jsonb)
  );
END; $function$;

-- ============================================================
-- 7) RPC: consumir crédito y (si cubre) marcar sub como pagada
-- ============================================================
CREATE OR REPLACE FUNCTION public.cuenta_publica_consume_credit(
  p_token uuid, p_fuente_tabla text, p_fuente_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_token public.cuenta_corriente_tokens%ROWTYPE;
  v_moneda text; v_por_pagar numeric := 0; v_credit_pool numeric := 0;
  v_to_apply numeric := 0; v_remaining numeric := 0;
  v_row record; v_sub public.suscripciones%ROWTYPE;
  v_left numeric;
BEGIN
  SELECT * INTO v_token FROM public.cuenta_corriente_tokens WHERE token = p_token;
  IF NOT FOUND OR v_token.revoked_at IS NOT NULL
     OR (v_token.expires_at IS NOT NULL AND v_token.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason','invalid_token');
  END IF;

  IF p_fuente_tabla <> 'suscripciones' THEN
    -- MVP: sólo suscripciones aplican crédito automático desde el link público
    RETURN jsonb_build_object('ok', true, 'applied', 0, 'remaining', 0, 'moneda','ARS', 'fully_paid', false);
  END IF;

  SELECT * INTO v_sub FROM public.suscripciones WHERE id = p_fuente_id AND alumno_id = v_token.alumno_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason','not_found'); END IF;

  SELECT COALESCE(p.moneda,'ARS') INTO v_moneda FROM public.planes p WHERE p.id = v_sub.plan_id;

  v_por_pagar := (
    CASE WHEN v_sub.metodo_pago IS NOT NULL AND v_sub.metodo_pago <> 'pendiente'
           THEN COALESCE(v_sub.precio_final, v_sub.precio_base, 0)
         ELSE COALESCE((SELECT precio FROM public.planes WHERE id = v_sub.plan_id), v_sub.precio_final, v_sub.precio_base, 0)
    END
  ) - COALESCE((
    SELECT SUM(haber) FROM public.vw_cuenta_corriente_movimientos
    WHERE alumno_id = v_token.alumno_id AND fuente_tabla='suscripciones' AND fuente_id = p_fuente_id
  ),0);

  IF v_por_pagar <= 0.01 THEN
    RETURN jsonb_build_object('ok', true, 'applied', 0, 'remaining', 0, 'moneda', v_moneda, 'fully_paid', true);
  END IF;

  SELECT COALESCE(SUM(monto),0) INTO v_credit_pool
  FROM public.cuenta_ajustes
  WHERE alumno_id = v_token.alumno_id AND tipo='credito'
    AND aplicado_a_fuente_id IS NULL AND moneda = v_moneda;

  v_to_apply := LEAST(v_por_pagar, v_credit_pool);
  IF v_to_apply <= 0.01 THEN
    RETURN jsonb_build_object('ok', true, 'applied', 0, 'remaining', v_por_pagar, 'moneda', v_moneda, 'fully_paid', false);
  END IF;

  v_left := v_to_apply;
  FOR v_row IN
    SELECT * FROM public.cuenta_ajustes
    WHERE alumno_id = v_token.alumno_id AND tipo='credito'
      AND aplicado_a_fuente_id IS NULL AND moneda = v_moneda
    ORDER BY fecha ASC, created_at ASC
  LOOP
    EXIT WHEN v_left <= 0.01;
    IF v_row.monto <= v_left + 0.01 THEN
      UPDATE public.cuenta_ajustes
      SET aplicado_a_fuente_tabla = p_fuente_tabla,
          aplicado_a_fuente_id = p_fuente_id,
          updated_at = now()
      WHERE id = v_row.id;
      v_left := v_left - v_row.monto;
    ELSE
      UPDATE public.cuenta_ajustes
      SET monto = v_row.monto - v_left, updated_at = now()
      WHERE id = v_row.id;
      INSERT INTO public.cuenta_ajustes (
        alumno_id, tipo, concepto, monto, moneda, fecha,
        notas, medio_pago, aplicado_a_fuente_tabla, aplicado_a_fuente_id
      ) VALUES (
        v_row.alumno_id, 'credito', COALESCE(v_row.concepto,'Aplicación de saldo a favor'),
        v_left, v_row.moneda, CURRENT_DATE,
        'Split automático — aplicado a deuda', v_row.medio_pago,
        p_fuente_tabla, p_fuente_id
      );
      v_left := 0;
    END IF;
  END LOOP;

  v_remaining := v_por_pagar - v_to_apply;

  -- Si cubre la deuda completa, marcar sub como pagada por saldo a favor
  IF v_remaining <= 0.01 THEN
    ALTER TABLE public.suscripciones DISABLE TRIGGER trg_guard_suscripcion_student_update;
    UPDATE public.suscripciones
    SET metodo_pago = 'saldo_a_favor',
        origen_registro = COALESCE(origen_registro,'cargado_admin'),
        estado = CASE
                   WHEN fecha_fin IS NOT NULL AND fecha_fin < CURRENT_DATE THEN 'finalizada'
                   ELSE 'activa'
                 END,
        fecha_inicio = COALESCE(fecha_inicio, CURRENT_DATE),
        updated_at = now()
    WHERE id = p_fuente_id;
    ALTER TABLE public.suscripciones ENABLE TRIGGER trg_guard_suscripcion_student_update;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'applied', v_to_apply, 'remaining', v_remaining,
    'moneda', v_moneda, 'fully_paid', (v_remaining <= 0.01)
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_cuenta_publica(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cuenta_publica_consume_credit(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cuenta_publica_deudas_raw(uuid) TO service_role;
