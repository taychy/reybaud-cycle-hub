-- ============================================================
-- FASE 1.5 · Control: vista de inconsistencias + tests de regresión
-- ============================================================

-- ------------------------------------------------------------
-- 0) Fix: suscripciones no tiene columna `moneda`.
--    cambiar_plan_suscripcion y get_alumno_payment_targets la referencian
--    y fallan en runtime. Se usa la moneda del plan.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_plan_suscripcion(
  _suscripcion_id uuid, _nuevo_plan_id uuid, _motivo text,
  _usar_precio_del_nuevo_plan boolean DEFAULT true,
  _precio_excepcion numeric DEFAULT NULL::numeric,
  _excepcion_motivo text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_sub record; v_plan record; v_base numeric; v_final numeric; v_desc numeric;
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

  RETURN jsonb_build_object('ok', true, 'precio_base', v_base, 'precio_final', v_final,
                            'moneda', COALESCE(v_plan.moneda, 'ARS'));
END $fn$;

CREATE OR REPLACE FUNCTION public.get_alumno_payment_targets(_alumno_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_reservations jsonb; v_subs jsonb; v_cargos jsonb; v_planes jsonb; v_emails text[];
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
      'id', r.id, 'label', COALESCE(e.title, 'Evento'),
      'currency', COALESCE(r.currency_snapshot, e.currency, 'ARS'),
      'total', COALESCE(r.amount_total, 0), 'paid', COALESCE(r.amount_paid, 0),
      'balance', COALESCE(r.balance_due, 0), 'estado', r.reservation_status,
      'fecha', COALESCE(e.date::text, r.created_at::date::text)
    ) AS x
    FROM public.event_reservations r
    LEFT JOIN public.events e ON e.id = r.event_id
    LEFT JOIN public.event_external_participants ep ON ep.id = r.external_participant_id
    WHERE (r.alumno_id = _alumno_id
           OR (r.alumno_id IS NULL AND lower(trim(COALESCE(r.external_email, ep.email, ''))) = ANY(v_emails)))
      AND COALESCE(r.estado, '') NOT IN ('cancelada', 'cancelado', 'rechazada', 'expirada')
      AND COALESCE(r.balance_due, 0) > 0.01
  ) s;

  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'fecha' DESC), '[]'::jsonb) INTO v_subs
  FROM (
    SELECT jsonb_build_object(
      'id', su.id, 'label', COALESCE(p.nombre, 'Plan'),
      'currency', COALESCE(p.moneda, 'ARS'),
      'total', COALESCE(su.precio_final, su.precio_base, p.precio, 0),
      'paid', public.subscription_paid_amount(su.id),
      'balance', COALESCE(su.precio_final, su.precio_base, p.precio, 0) - public.subscription_paid_amount(su.id),
      'estado', su.estado, 'fecha', su.fecha_inicio::text,
      'periodo', to_char(su.fecha_inicio, 'YYYY-MM'),
      'mp_candidate', (
        SELECT jsonb_build_object('mp_payment_id', mp.mp_payment_id, 'amount', mp.amount, 'fecha', mp.fecha_movimiento)
        FROM public.mp_account_movements mp
        WHERE mp.alumno_id = _alumno_id AND mp.status = 'approved'
          AND mp.suscripcion_id IS NULL AND mp.reservation_payment_id IS NULL
          AND ABS(mp.amount - COALESCE(su.precio_final, su.precio_base, 0)) < 1
        ORDER BY mp.fecha_movimiento DESC LIMIT 1)
    ) AS y
    FROM public.suscripciones su
    LEFT JOIN public.planes p ON p.id = su.plan_id
    WHERE su.alumno_id = _alumno_id AND su.cancelada_at IS NULL
      AND su.estado IN ('pendiente', 'pendiente_verificacion', 'vencida', 'activa')
      AND (COALESCE(su.precio_final, su.precio_base, p.precio, 0) - public.subscription_paid_amount(su.id)) > 0.01
  ) s2;

  SELECT COALESCE(jsonb_agg(z ORDER BY z->>'fecha' DESC), '[]'::jsonb) INTO v_cargos
  FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'label', COALESCE(NULLIF(c.concepto, ''), 'Cargo en cuenta corriente'),
      'currency', COALESCE(c.moneda, 'ARS'), 'total', c.monto,
      'paid', COALESCE(ap.aplicado, 0), 'balance', c.monto - COALESCE(ap.aplicado, 0),
      'fecha', c.fecha::text) AS z
    FROM public.cuenta_ajustes c
    LEFT JOIN LATERAL (
      SELECT SUM(cr.monto) AS aplicado FROM public.cuenta_ajustes cr
      WHERE cr.tipo = 'credito' AND cr.aplicado_a_fuente_tabla = 'cuenta_ajustes'
        AND cr.aplicado_a_fuente_id = c.id) ap ON true
    WHERE c.alumno_id = _alumno_id AND c.tipo = 'cargo'
      AND c.monto - COALESCE(ap.aplicado, 0) > 0.01
  ) s3;

  SELECT COALESCE(jsonb_agg(w ORDER BY (w->>'usado')::boolean DESC, w->>'label'), '[]'::jsonb) INTO v_planes
  FROM (
    SELECT jsonb_build_object(
      'id', p.id, 'label', p.nombre, 'currency', COALESCE(p.moneda, 'ARS'),
      'precio', COALESCE(p.precio, 0),
      'usado', EXISTS (SELECT 1 FROM public.suscripciones su2 WHERE su2.alumno_id = _alumno_id AND su2.plan_id = p.id)) AS w
    FROM public.planes p
    WHERE COALESCE(p.activo, true) = true
       OR EXISTS (SELECT 1 FROM public.suscripciones su3 WHERE su3.alumno_id = _alumno_id AND su3.plan_id = p.id)
  ) s4;

  RETURN jsonb_build_object('reservations', v_reservations, 'subscriptions', v_subs,
                            'cargos', v_cargos, 'planes', v_planes);
END $fn$;

-- ------------------------------------------------------------
-- 1) Vista de inconsistencias (SOLO DETECTA, no corrige)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_pagos_inconsistencias;

CREATE VIEW public.vw_pagos_inconsistencias AS
WITH saldo_alumno AS (
  SELECT alumno_id, moneda, SUM(debe - haber) AS saldo
  FROM public.vw_cuenta_corriente_movimientos
  GROUP BY 1, 2
),
nombre AS (
  SELECT id, TRIM(COALESCE(nombre, '') || ' ' || COALESCE(apellido, '')) AS full_name FROM public.alumnos
)

-- 1. MP identificado pero no imputado a ninguna obligación
SELECT
  'MP_IDENTIFICADO_SIN_IMPUTAR'::text AS tipo,
  'alta'::text AS severidad,
  m.alumno_id,
  n.full_name AS alumno_nombre,
  (m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
  m.mp_payment_id,
  'mp_account_movements'::text AS pago_origen,
  m.id AS pago_id,
  m.amount AS monto_pago,
  m.currency AS moneda,
  NULL::text AS obligacion_tipo,
  NULL::uuid AS obligacion_id,
  NULL::numeric AS monto_obligacion,
  NULL::numeric AS pagado,
  NULL::numeric AS saldo,
  NULL::numeric AS diferencia,
  'Pago de Mercado Pago con alumno identificado pero sin imputar a ninguna deuda.'::text AS descripcion,
  jsonb_build_object('cuenta_mp_id', m.cuenta_mp_id, 'payer_name', m.payer_name,
                     'description', m.description) AS metadata
FROM public.mp_account_movements m
LEFT JOIN nombre n ON n.id = m.alumno_id
WHERE m.status = 'approved' AND m.direccion = 'ingreso'
  AND m.alumno_id IS NOT NULL
  AND m.suscripcion_id IS NULL
  AND m.reservation_payment_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.cuenta_ajustes ca
    WHERE ca.tipo = 'credito' AND ca.referencia_externa = m.mp_payment_id
      AND ca.alumno_id = m.alumno_id AND ca.aplicado_a_fuente_id IS NOT NULL)

UNION ALL

-- 2. MP sin identificar
SELECT
  'MP_SIN_IDENTIFICAR', 'media', NULL::uuid, NULL::text,
  (m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  m.mp_payment_id, 'mp_account_movements', m.id, m.amount, m.currency,
  NULL, NULL::uuid, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
  'Ingreso de Mercado Pago sin alumno identificado.',
  jsonb_build_object('cuenta_mp_id', m.cuenta_mp_id, 'payer_name', m.payer_name,
                     'payer_email', m.payer_email, 'description', m.description)
FROM public.mp_account_movements m
WHERE m.status = 'approved' AND m.direccion = 'ingreso' AND m.alumno_id IS NULL

UNION ALL

-- 3a. Suscripción con evidencia de pago pero estado impago
SELECT
  'PAGO_CONFIRMADO_CON_SALDO_PENDIENTE', 'critica', s.alumno_id, n.full_name,
  s.fecha_inicio, s.mp_payment_id, 'suscripciones', s.id,
  public.subscription_paid_amount(s.id), COALESCE(p.moneda, 'ARS'),
  'suscripcion', s.id, COALESCE(s.precio_final, s.precio_base, p.precio, 0),
  public.subscription_paid_amount(s.id),
  COALESCE(s.precio_final, s.precio_base, p.precio, 0) - public.subscription_paid_amount(s.id),
  COALESCE(s.precio_final, s.precio_base, p.precio, 0) - public.subscription_paid_amount(s.id),
  'La suscripción tiene evidencia de pago pero sigue marcada como impaga.',
  jsonb_build_object('estado', s.estado, 'metodo_pago', s.metodo_pago, 'mp_status', s.mp_status,
                     'origen_registro', s.origen_registro, 'plan', p.nombre)
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN nombre n ON n.id = s.alumno_id
WHERE s.cancelada_at IS NULL
  AND s.estado IN ('pendiente', 'pendiente_verificacion', 'vencida')
  AND public.is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro,
                                  s.chequeado_admin, s.mp_payment_id)

UNION ALL

-- 3b. Reserva con pagos que cubren el total pero con saldo abierto
SELECT
  'PAGO_CONFIRMADO_CON_SALDO_PENDIENTE', 'critica', r.alumno_id, n.full_name,
  COALESCE(r.confirmed_at::date, r.created_at::date), NULL::text,
  'event_reservations', r.id, COALESCE(r.amount_paid, 0),
  COALESCE(r.currency_snapshot, r.moneda, 'ARS'),
  'reserva', r.id, COALESCE(r.amount_total, 0), COALESCE(r.amount_paid, 0),
  COALESCE(r.balance_due, 0), COALESCE(r.balance_due, 0),
  'La reserva registra pagos que cubren el total pero mantiene saldo pendiente.',
  jsonb_build_object('event_id', r.event_id, 'estado', r.reservation_status)
FROM public.event_reservations r
LEFT JOIN nombre n ON n.id = r.alumno_id
WHERE r.cancelled_at IS NULL
  AND COALESCE(r.reservation_status, '') NOT IN ('cancelada', 'cancelled', 'rechazada')
  AND COALESCE(r.amount_paid, 0) >= COALESCE(r.amount_total, 0) - 0.01
  AND COALESCE(r.amount_total, 0) > 0
  AND COALESCE(r.balance_due, 0) > 0.01

UNION ALL

-- 4. Medio de pago contradictorio
SELECT
  'MEDIO_PAGO_CONTRADICTORIO', 'media', s.alumno_id, n.full_name,
  s.fecha_inicio, s.mp_payment_id, 'suscripciones', s.id,
  COALESCE(s.precio_final, s.precio_base, p.precio, 0), COALESCE(p.moneda, 'ARS'),
  'suscripcion', s.id, COALESCE(s.precio_final, s.precio_base, p.precio, 0),
  public.subscription_paid_amount(s.id), NULL::numeric, NULL::numeric,
  CASE
    WHEN s.mp_payment_id IS NOT NULL AND COALESCE(s.metodo_pago, '') <> 'mercadopago'
      THEN 'Tiene pago de Mercado Pago vinculado pero el medio de pago dice otra cosa.'
    WHEN COALESCE(s.metodo_pago, '') = 'mercadopago' AND s.mp_payment_id IS NULL
      THEN 'Figura como pagada con Mercado Pago pero no hay operación vinculada.'
    ELSE 'Suscripción activa/conciliada sin medio de pago definido.'
  END,
  jsonb_build_object('estado', s.estado, 'metodo_pago', s.metodo_pago, 'mp_status', s.mp_status,
                     'origen_registro', s.origen_registro, 'plan', p.nombre)
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN nombre n ON n.id = s.alumno_id
WHERE s.cancelada_at IS NULL
  AND (
    (s.mp_payment_id IS NOT NULL AND COALESCE(s.metodo_pago, '') <> 'mercadopago')
    OR (COALESCE(s.metodo_pago, '') = 'mercadopago' AND s.mp_payment_id IS NULL)
    OR (s.estado IN ('activa', 'conciliado') AND COALESCE(s.metodo_pago, 'pendiente') = 'pendiente')
  )

UNION ALL

-- 5. Importe del pago distinto al saldo de la obligación (puede ser parcial o excedente)
SELECT
  'IMPORTE_PAGO_DIFERENTE_A_SALDO', 'media', m.alumno_id, n.full_name,
  (m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  m.mp_payment_id, 'mp_account_movements', m.id, m.amount, m.currency,
  'suscripcion', s.id, COALESCE(s.precio_final, s.precio_base, p.precio, 0),
  m.amount,
  COALESCE(s.precio_final, s.precio_base, p.precio, 0) - m.amount,
  m.amount - COALESCE(s.precio_final, s.precio_base, p.precio, 0),
  'El importe imputado no coincide con el de la obligación (puede ser pago parcial o excedente).',
  jsonb_build_object('plan', p.nombre, 'estado', s.estado, 'metodo_pago', s.metodo_pago)
FROM public.mp_account_movements m
JOIN public.suscripciones s ON s.id = m.suscripcion_id
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN nombre n ON n.id = m.alumno_id
WHERE m.status = 'approved' AND s.cancelada_at IS NULL
  AND ABS(m.amount - COALESCE(s.precio_final, s.precio_base, p.precio, 0)) > 1

UNION ALL

-- 6a. Mismo mp_payment_id imputado a más de una suscripción
SELECT
  'CREDITO_MP_DUPLICADO', 'critica', s.alumno_id, n.full_name,
  s.fecha_inicio, s.mp_payment_id, 'suscripciones', s.id,
  COALESCE(s.precio_final, s.precio_base, 0), COALESCE(p.moneda, 'ARS'),
  'suscripcion', s.id, COALESCE(s.precio_final, s.precio_base, 0),
  public.subscription_paid_amount(s.id), NULL::numeric, NULL::numeric,
  'El mismo pago de Mercado Pago está vinculado a más de una suscripción.',
  jsonb_build_object('plan', p.nombre, 'estado', s.estado,
                     'suscripciones_con_ese_pago', (
                       SELECT jsonb_agg(s2.id) FROM public.suscripciones s2
                       WHERE s2.mp_payment_id = s.mp_payment_id AND s2.cancelada_at IS NULL))
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN nombre n ON n.id = s.alumno_id
WHERE s.mp_payment_id IS NOT NULL AND s.cancelada_at IS NULL
  AND (SELECT count(*) FROM public.suscripciones s3
        WHERE s3.mp_payment_id = s.mp_payment_id AND s3.cancelada_at IS NULL) > 1

UNION ALL

-- 6b. Mismo mp_payment_id con más de un crédito en cuenta corriente
SELECT
  'CREDITO_MP_DUPLICADO', 'critica', ca.alumno_id, n.full_name,
  ca.fecha, ca.referencia_externa, 'cuenta_ajustes', ca.id, ca.monto,
  COALESCE(ca.moneda, 'ARS'), 'credito', ca.id, ca.monto, ca.monto, NULL::numeric, NULL::numeric,
  'Hay más de un crédito en cuenta corriente para la misma operación de Mercado Pago.',
  jsonb_build_object('concepto', ca.concepto, 'aplicado_a', ca.aplicado_a_fuente_tabla)
FROM public.cuenta_ajustes ca
LEFT JOIN nombre n ON n.id = ca.alumno_id
WHERE ca.tipo = 'credito' AND ca.referencia_externa IS NOT NULL
  AND (SELECT count(*) FROM public.cuenta_ajustes c2
        WHERE c2.tipo = 'credito' AND c2.referencia_externa = ca.referencia_externa
          AND c2.alumno_id = ca.alumno_id) > 1

UNION ALL

-- 7. Crédito de MP sin aplicar mientras el alumno tiene deuda
SELECT
  'CREDITO_MP_SIN_APLICAR_CON_DEUDA', 'alta', ca.alumno_id, n.full_name,
  ca.fecha, ca.referencia_externa, 'cuenta_ajustes', ca.id, ca.monto,
  COALESCE(ca.moneda, 'ARS'), NULL, NULL::uuid, NULL::numeric, NULL::numeric,
  sa.saldo, LEAST(ca.monto, sa.saldo),
  'El alumno tiene un crédito sin aplicar y al mismo tiempo deuda abierta.',
  jsonb_build_object('concepto', ca.concepto, 'medio_pago', ca.medio_pago, 'saldo_alumno', sa.saldo)
FROM public.cuenta_ajustes ca
LEFT JOIN nombre n ON n.id = ca.alumno_id
JOIN saldo_alumno sa ON sa.alumno_id = ca.alumno_id AND sa.moneda = COALESCE(ca.moneda, 'ARS')
WHERE ca.tipo = 'credito' AND ca.aplicado_a_fuente_id IS NULL AND sa.saldo > 0.01

UNION ALL

-- 8. Facturación estancada
SELECT
  'FACTURACION_ESTANCADA', 'alta', fc.alumno_id, COALESCE(n.full_name, fc.cliente_nombre),
  COALESCE(fc.pagado_at::date, fc.created_at::date), fc.pago_id, 'facturacion_cola', fc.id,
  fc.monto, COALESCE(fc.moneda, 'ARS'), fc.referencia_tipo, fc.referencia_id,
  fc.monto, NULL::numeric, NULL::numeric, NULL::numeric,
  'Pago cobrado hace más de 7 días y todavía sin factura emitida.',
  jsonb_build_object('estado', fc.estado, 'concepto', fc.concepto, 'segmento', fc.segmento,
                     'motivo_arrastre', fc.motivo_arrastre)
FROM public.facturacion_cola fc
LEFT JOIN nombre n ON n.id = fc.alumno_id
WHERE fc.estado IN ('pendiente', 'error')
  AND COALESCE(fc.pagado_at, fc.created_at) < now() - interval '7 days';

COMMENT ON VIEW public.vw_pagos_inconsistencias IS
  'Fase 1.5 · Capa de detección de inconsistencias de pagos. SOLO LECTURA: detecta, no corrige. IMPORTE_PAGO_DIFERENTE_A_SALDO puede ser un pago parcial o un excedente legítimo.';

REVOKE ALL ON public.vw_pagos_inconsistencias FROM anon, authenticated;
GRANT SELECT ON public.vw_pagos_inconsistencias TO service_role;

-- RPC de acceso para admins
CREATE OR REPLACE FUNCTION public.get_pagos_inconsistencias()
RETURNS SETOF public.vw_pagos_inconsistencias
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.vw_pagos_inconsistencias;
END $fn$;

GRANT EXECUTE ON FUNCTION public.get_pagos_inconsistencias() TO authenticated;

-- ------------------------------------------------------------
-- 2) Tests de regresión ejecutables (revierten todo lo que crean)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_financial_regression_tests()
RETURNS TABLE(test int, estado text, nombre text, detalle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_admin uuid;
  v_alumno uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
  v_plan2 uuid := gen_random_uuid();
  v_cta uuid;
  v_sub1 uuid; v_sub2 uuid; v_sub3 uuid; v_mov uuid;
  v_mp record; v_s record; v_p record;
  v_n int; v_debe int; v_saldo0 numeric; v_saldo1 numeric; v_saldo numeric;
  v_notas0 text; v_notas1 text; v_fallo boolean; v_msg text;
  v_antes numeric; v_desp numeric; v_bad int; v_tot int;
  v_a uuid; v_j jsonb; v_item jsonb; v_k text; v_estado text;

  PROCEDURE_PLACEHOLDER int;
BEGIN
  IF NOT (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
          OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  SELECT id INTO v_cta FROM public.cuentas_mp LIMIT 1;

  BEGIN
    -- ---------- fixtures ----------
    INSERT INTO public.alumnos (id, nombre, apellido, email, grupo, estado)
    VALUES (v_alumno, 'QA', 'Regresión', 'qa-' || v_alumno || '@test.local', 'Sin grupo', 'activo');

    INSERT INTO public.planes (id, nombre, precio, moneda, activo, frecuencia)
    VALUES (v_plan, 'QA Plan A ' || left(v_plan::text, 8), 10000, 'ARS', true, 'mensual'),
           (v_plan2, 'QA Plan B ' || left(v_plan2::text, 8), 15000, 'ARS', true, 'mensual');

    PERFORM set_config('app.sub_internal', 'on', true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_alumno, v_plan, 'pendiente', 'pendiente', 'cargado_admin', 10000, 10000,
            date_trunc('month', CURRENT_DATE)::date,
            (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date)
    RETURNING id INTO v_sub1;
    PERFORM set_config('app.sub_internal', 'off', true);

    INSERT INTO public.mp_account_movements (cuenta_mp_id, mp_payment_id, tipo, status, amount,
                                             currency, direccion, fecha_movimiento)
    VALUES (v_cta, 'QA-' || substr(gen_random_uuid()::text, 1, 12), 'payment', 'approved',
            10000, 'ARS', 'ingreso', now())
    RETURNING id INTO v_mov;

    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo0
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;

    -- ---------- TEST 1 ----------
    PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub1, 'test');
    SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = v_mov;
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub1;

    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: metodo_pago = mercadopago',
      'ok', v_s.metodo_pago = 'mercadopago', 'd', COALESCE(v_s.metodo_pago, 'null'));
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: mp_status = approved',
      'ok', v_s.mp_status = 'approved', 'd', COALESCE(v_s.mp_status, 'null'));
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: mp_payment_id correcto',
      'ok', v_s.mp_payment_id = v_mp.mp_payment_id, 'd', COALESCE(v_s.mp_payment_id, 'null'));
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: cuenta_mp_id correcta',
      'ok', v_s.cuenta_mp_id = v_mp.cuenta_mp_id, 'd', COALESCE(v_s.cuenta_mp_id::text, 'null'));

    SELECT count(*) INTO v_n FROM public.mp_account_movements
      WHERE suscripcion_id = v_sub1 AND status = 'approved';
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: una sola imputación',
      'ok', v_n = 1, 'd', 'imputaciones=' || v_n);

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: un único HABER',
      'ok', v_n = 1, 'd', 'haberes=' || v_n);

    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo1
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 1, 'n', 'Asignar MP→suscripción: el saldo baja una sola vez',
      'ok', ROUND(v_saldo0 - v_saldo1, 2) = 10000, 'd', 'delta=' || ROUND(v_saldo0 - v_saldo1, 2));

    -- ---------- TEST 2 (idempotencia) ----------
    SELECT notas INTO v_notas0 FROM public.suscripciones WHERE id = v_sub1;
    PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub1, 'test');
    SELECT notas INTO v_notas1 FROM public.suscripciones WHERE id = v_sub1;

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 2, 'n', 'Asignar dos veces: no duplica HABER',
      'ok', v_n = 1, 'd', 'haberes=' || v_n);
    v_out := v_out || jsonb_build_object('t', 2, 'n', 'Asignar dos veces: no duplica notas',
      'ok', v_notas0 IS NOT DISTINCT FROM v_notas1, 'd', COALESCE(v_notas1, ''));
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 2, 'n', 'Asignar dos veces: el saldo no cambia',
      'ok', ROUND(v_saldo, 2) = ROUND(v_saldo1, 2), 'd', 'saldo=' || ROUND(v_saldo, 2));

    -- ---------- TEST 3 (desasignar) ----------
    PERFORM public.unassign_mp_movement(v_mov);
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub1;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Desasignar: se borra la evidencia MP de la obligación',
      'ok', v_s.mp_payment_id IS NULL AND v_s.mp_status IS NULL AND v_s.metodo_pago = 'pendiente',
      'd', format('mp=%s status=%s metodo=%s', v_s.mp_payment_id, v_s.mp_status, v_s.metodo_pago));

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Desasignar: desaparece el HABER',
      'ok', v_n = 0, 'd', 'haberes=' || v_n);

    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Desasignar: reaparece el saldo pendiente',
      'ok', ROUND(v_saldo, 2) = ROUND(v_saldo0, 2), 'd', 'saldo=' || ROUND(v_saldo, 2));

    PERFORM public.assign_mp_movement_to_alumno(v_mov, v_alumno, 'test');
    SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = v_mov;
    v_estado := CASE
      WHEN v_mp.suscripcion_id IS NOT NULL OR v_mp.reservation_payment_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.cuenta_ajustes ca WHERE ca.tipo = 'credito'
                    AND ca.referencia_externa = v_mp.mp_payment_id AND ca.aplicado_a_fuente_id IS NOT NULL)
        THEN 'imputado'
      WHEN v_mp.alumno_id IS NOT NULL THEN 'identificado_sin_imputar'
      ELSE 'sin_identificar' END;
    v_out := v_out || jsonb_build_object('t', 3, 'n', 'Desasignar: el movimiento queda IDENTIFICADO · SIN IMPUTAR',
      'ok', v_estado = 'identificado_sin_imputar', 'd', 'estado=' || v_estado);

    -- ---------- TEST 4 (reasignar) ----------
    PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub1, 'test');
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub1;
    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'pago_suscripcion' AND haber > 0;
    SELECT COALESCE(SUM(debe - haber), 0) INTO v_saldo
      FROM public.vw_cuenta_corriente_movimientos WHERE alumno_id = v_alumno;
    v_out := v_out || jsonb_build_object('t', 4, 'n', 'Asignar→desasignar→reasignar: estado final idéntico',
      'ok', v_s.metodo_pago = 'mercadopago' AND v_s.mp_status = 'approved' AND v_n = 1
            AND ROUND(v_saldo, 2) = ROUND(v_saldo1, 2),
      'd', format('metodo=%s haberes=%s saldo=%s', v_s.metodo_pago, v_n, ROUND(v_saldo, 2)));

    -- ---------- TEST 5 (doble imputación) ----------
    PERFORM set_config('app.sub_internal', 'on', true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                      precio_base, precio_final, fecha_inicio, fecha_fin)
    VALUES (v_alumno, v_plan2, 'pendiente', 'pendiente', 'cargado_admin', 15000, 15000,
            (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
            (date_trunc('month', CURRENT_DATE) + interval '2 month - 1 day')::date)
    RETURNING id INTO v_sub2;
    PERFORM set_config('app.sub_internal', 'off', true);

    v_fallo := false; v_msg := '';
    BEGIN
      PERFORM public.assign_mp_movement_to_target(v_mov, v_alumno, 'suscripcion', v_sub2, 'test');
    EXCEPTION WHEN OTHERS THEN v_fallo := true; v_msg := SQLERRM;
    END;
    v_out := v_out || jsonb_build_object('t', 5, 'n', 'Imputar el mismo MP a dos obligaciones → falla',
      'ok', v_fallo, 'd', v_msg);

    -- ---------- TEST 6 y 7 (pago informado) ----------
    PERFORM set_config('app.sub_internal', 'on', true);
    INSERT INTO public.suscripciones (alumno_id, plan_id, estado, metodo_pago, origen_registro,
                                      precio_base, precio_final, fecha_inicio, fecha_fin, chequeado_admin)
    VALUES (v_alumno, v_plan, 'activa', 'transferencia', 'informado_alumno', 10000, 10000,
            (date_trunc('month', CURRENT_DATE) + interval '2 month')::date,
            (date_trunc('month', CURRENT_DATE) + interval '3 month - 1 day')::date, true)
    RETURNING id INTO v_sub3;
    PERFORM set_config('app.sub_internal', 'off', true);

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub3 AND tipo = 'pago_suscripcion' AND haber > 0;
    v_out := v_out || jsonb_build_object('t', 6, 'n', 'Pago informado APROBADO genera HABER',
      'ok', v_n = 1, 'd', 'haberes=' || v_n);

    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones SET estado = 'pendiente', metodo_pago = 'pendiente',
           chequeado_admin = false, mp_status = NULL, mp_payment_id = NULL WHERE id = v_sub3;
    PERFORM set_config('app.sub_internal', 'off', true);

    SELECT count(*) INTO v_n FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub3 AND tipo = 'pago_suscripcion' AND haber > 0;
    SELECT count(*) INTO v_debe FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub3 AND tipo = 'cargo_suscripcion' AND debe > 0;
    v_out := v_out || jsonb_build_object('t', 7, 'n', 'Pago informado RECHAZADO no genera HABER',
      'ok', v_n = 0, 'd', 'haberes=' || v_n);
    v_out := v_out || jsonb_build_object('t', 7, 'n', 'Pago informado RECHAZADO mantiene la deuda',
      'ok', v_debe = 1, 'd', 'cargos=' || v_debe);

    -- ---------- TEST 8 (cambio de plan) ----------
    PERFORM public.cambiar_plan_suscripcion(v_sub2, v_plan, 'test de regresión', true, NULL, NULL);
    SELECT * INTO v_s FROM public.suscripciones WHERE id = v_sub2;
    SELECT * INTO v_p FROM public.planes WHERE id = v_s.plan_id;
    v_out := v_out || jsonb_build_object('t', 8, 'n', 'Cambio de plan: plan_id actualizado',
      'ok', v_s.plan_id = v_plan, 'd', v_s.plan_id::text);
    v_out := v_out || jsonb_build_object('t', 8, 'n', 'Cambio de plan: precio alineado al plan nuevo',
      'ok', COALESCE(v_s.precio_final, v_s.precio_base) = v_p.precio,
      'd', format('sub=%s plan=%s', COALESCE(v_s.precio_final, v_s.precio_base), v_p.precio));
    v_out := v_out || jsonb_build_object('t', 8, 'n', 'Cambio de plan: moneda coherente en la cuenta corriente',
      'ok', (SELECT moneda FROM public.vw_cuenta_corriente_movimientos
              WHERE fuente_id = v_sub2 AND tipo = 'cargo_suscripcion') = COALESCE(v_p.moneda, 'ARS'),
      'd', format('plan=%s', v_p.moneda));

    -- ---------- TEST 9 (precio del plan no altera el cargo histórico) ----------
    SELECT debe INTO v_antes FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'cargo_suscripcion';
    UPDATE public.planes SET precio = precio + 7777 WHERE id = v_plan;
    SELECT debe INTO v_desp FROM public.vw_cuenta_corriente_movimientos
      WHERE fuente_id = v_sub1 AND tipo = 'cargo_suscripcion';
    v_out := v_out || jsonb_build_object('t', 9, 'n', 'Subir planes.precio no modifica el cargo histórico',
      'ok', v_antes = v_desp, 'd', format('antes=%s despues=%s', v_antes, v_desp));

    -- ---------- TEST 10 (targets sin obligaciones saldadas) ----------
    v_bad := 0; v_tot := 0;
    FOR v_a IN
      SELECT v_alumno
      UNION ALL
      SELECT DISTINCT alumno_id FROM public.mp_account_movements
       WHERE alumno_id IS NOT NULL LIMIT 40
    LOOP
      v_j := public.get_alumno_payment_targets(v_a);
      FOREACH v_k IN ARRAY ARRAY['reservations', 'subscriptions', 'cargos'] LOOP
        FOR v_item IN SELECT jsonb_array_elements(COALESCE(v_j -> v_k, '[]'::jsonb)) LOOP
          v_tot := v_tot + 1;
          IF COALESCE((v_item ->> 'balance')::numeric, 0) <= 0.01 THEN v_bad := v_bad + 1; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
    v_out := v_out || jsonb_build_object('t', 10, 'n', 'get_alumno_payment_targets no devuelve obligaciones saldadas',
      'ok', v_bad = 0, 'd', format('revisadas=%s con balance<=0.01=%s', v_tot, v_bad));

    -- Revertir TODO lo creado por los tests
    RAISE EXCEPTION 'ROLLBACK_TESTS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TESTS' THEN
      v_out := v_out || jsonb_build_object('t', 0, 'n', 'ERROR FATAL durante los tests', 'ok', false, 'd', SQLERRM);
    END IF;
  END;

  RETURN QUERY
  SELECT (e->>'t')::int,
         CASE WHEN (e->>'ok')::boolean THEN 'PASS' ELSE 'FAIL' END,
         e->>'n', e->>'d'
  FROM jsonb_array_elements(v_out) e
  ORDER BY (e->>'t')::int;
END $fn$;

GRANT EXECUTE ON FUNCTION public.run_financial_regression_tests() TO service_role;