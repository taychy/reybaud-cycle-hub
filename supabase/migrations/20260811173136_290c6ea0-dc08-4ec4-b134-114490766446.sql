
-- ============================================================
-- FASE 2 · Modelo de imputaciones (paralelo) + ajuste detector
-- ============================================================

-- ---------- 1. TABLA pagos_imputaciones ----------
CREATE TABLE IF NOT EXISTS public.pagos_imputaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_origen_tipo text NOT NULL CHECK (pago_origen_tipo IN ('mp_movement','reservation_payment','cuenta_ajuste','manual')),
  pago_origen_id uuid NOT NULL,
  obligacion_tipo text NOT NULL CHECK (obligacion_tipo IN ('suscripcion','reserva','store_order','otro')),
  obligacion_id uuid NOT NULL,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  monto numeric NOT NULL CHECK (monto > 0),
  moneda text NOT NULL DEFAULT 'ARS',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  anulado_at timestamptz,
  anulado_por uuid,
  motivo_anulacion text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT, UPDATE ON public.pagos_imputaciones TO authenticated;
GRANT ALL ON public.pagos_imputaciones TO service_role;
ALTER TABLE public.pagos_imputaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gestionan imputaciones" ON public.pagos_imputaciones;
CREATE POLICY "Admins gestionan imputaciones" ON public.pagos_imputaciones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Alumno ve sus imputaciones" ON public.pagos_imputaciones;
CREATE POLICY "Alumno ve sus imputaciones" ON public.pagos_imputaciones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = alumno_id AND a.email = auth.email()));

-- idempotencia: una sola imputación activa por (pago, obligación)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_imputaciones_activa
  ON public.pagos_imputaciones (pago_origen_tipo, pago_origen_id, obligacion_tipo, obligacion_id)
  WHERE anulado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_imputaciones_pago ON public.pagos_imputaciones (pago_origen_tipo, pago_origen_id) WHERE anulado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_imputaciones_oblig ON public.pagos_imputaciones (obligacion_tipo, obligacion_id) WHERE anulado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_imputaciones_alumno ON public.pagos_imputaciones (alumno_id) WHERE anulado_at IS NULL;

COMMENT ON TABLE public.pagos_imputaciones IS
  'FASE 2: destino del dinero. Un ingreso puede imputarse a N obligaciones y una obligación recibir N pagos. No copia mp_payment_id: la referencia MP vive en el pago original.';

-- ---------- 2. FUNCIONES DE MONTOS ----------
CREATE OR REPLACE FUNCTION public.pago_monto_bruto(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _tipo
    WHEN 'mp_movement' THEN (SELECT amount FROM public.mp_account_movements WHERE id = _id)
    WHEN 'reservation_payment' THEN (SELECT amount FROM public.reservation_payments WHERE id = _id)
    WHEN 'cuenta_ajuste' THEN (SELECT monto FROM public.cuenta_ajustes WHERE id = _id)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.pago_monto_imputado(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(monto), 0) FROM public.pagos_imputaciones
  WHERE pago_origen_tipo = _tipo AND pago_origen_id = _id AND anulado_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.pago_saldo_disponible(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.pago_monto_bruto(_tipo, _id), 0) - public.pago_monto_imputado(_tipo, _id);
$$;

CREATE OR REPLACE FUNCTION public.obligacion_monto(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _tipo
    WHEN 'suscripcion' THEN (SELECT COALESCE(s.precio_final, s.precio_base, p.precio, 0)
                               FROM public.suscripciones s LEFT JOIN public.planes p ON p.id = s.plan_id
                              WHERE s.id = _id)
    WHEN 'reserva' THEN (SELECT COALESCE(amount_total, 0) FROM public.event_reservations WHERE id = _id)
    WHEN 'store_order' THEN (SELECT COALESCE(total, 0) FROM public.store_orders WHERE id = _id)
    WHEN 'otro' THEN (SELECT monto FROM public.cuenta_ajustes WHERE id = _id)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.obligacion_imputado(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(monto), 0) FROM public.pagos_imputaciones
  WHERE obligacion_tipo = _tipo AND obligacion_id = _id AND anulado_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.obligacion_saldo(_tipo text, _id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.obligacion_monto(_tipo, _id), 0) - public.obligacion_imputado(_tipo, _id);
$$;

-- ---------- 3. GUARDA ANTI-SOBREIMPUTACIÓN ----------
CREATE OR REPLACE FUNCTION public.guard_pagos_imputaciones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bruto numeric;
  v_usado numeric;
BEGIN
  IF NEW.anulado_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_bruto := public.pago_monto_bruto(NEW.pago_origen_tipo, NEW.pago_origen_id);

  IF v_bruto IS NULL AND NEW.pago_origen_tipo <> 'manual' THEN
    RAISE EXCEPTION 'El pago origen % % no existe', NEW.pago_origen_tipo, NEW.pago_origen_id;
  END IF;

  IF v_bruto IS NOT NULL THEN
    SELECT COALESCE(SUM(monto), 0) INTO v_usado
      FROM public.pagos_imputaciones
     WHERE pago_origen_tipo = NEW.pago_origen_tipo
       AND pago_origen_id = NEW.pago_origen_id
       AND anulado_at IS NULL
       AND id <> NEW.id;

    IF (v_usado + NEW.monto) > (v_bruto + 0.01)
       AND COALESCE(NEW.metadata->>'sobreimputacion_autorizada', 'false') <> 'true' THEN
      RAISE EXCEPTION 'Sobreimputación: el pago tiene % disponible y se intenta imputar % (ya imputado %)',
        ROUND(v_bruto - v_usado, 2), ROUND(NEW.monto, 2), ROUND(v_usado, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pagos_imputaciones ON public.pagos_imputaciones;
CREATE TRIGGER trg_guard_pagos_imputaciones
  BEFORE INSERT OR UPDATE ON public.pagos_imputaciones
  FOR EACH ROW EXECUTE FUNCTION public.guard_pagos_imputaciones();

-- ---------- 4. RPCs ----------
CREATE OR REPLACE FUNCTION public.imputar_pago(
  _pago_origen_tipo text,
  _pago_origen_id uuid,
  _obligacion_tipo text,
  _obligacion_id uuid,
  _alumno_id uuid,
  _monto numeric,
  _moneda text DEFAULT 'ARS',
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.pagos_imputaciones;
  v_id uuid;
BEGIN
  IF _monto IS NULL OR _monto <= 0 THEN
    RAISE EXCEPTION 'El monto a imputar debe ser mayor que cero';
  END IF;

  SELECT * INTO v_existing FROM public.pagos_imputaciones
   WHERE pago_origen_tipo = _pago_origen_tipo AND pago_origen_id = _pago_origen_id
     AND obligacion_tipo = _obligacion_tipo AND obligacion_id = _obligacion_id
     AND anulado_at IS NULL
   LIMIT 1;

  IF FOUND THEN
    IF ROUND(v_existing.monto, 2) = ROUND(_monto, 2) THEN
      RETURN v_existing.id;  -- idempotente
    END IF;
    RAISE EXCEPTION 'Ya existe una imputación activa de este pago a esta obligación por % (se pidió %). Anulala antes de cambiar el importe.',
      ROUND(v_existing.monto, 2), ROUND(_monto, 2);
  END IF;

  INSERT INTO public.pagos_imputaciones (
    pago_origen_tipo, pago_origen_id, obligacion_tipo, obligacion_id,
    alumno_id, monto, moneda, created_by, metadata
  ) VALUES (
    _pago_origen_tipo, _pago_origen_id, _obligacion_tipo, _obligacion_id,
    _alumno_id, _monto, COALESCE(_moneda, 'ARS'), auth.uid(), COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_imputacion(_id uuid, _motivo text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.pagos_imputaciones
     SET anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = _motivo
   WHERE id = _id AND anulado_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;  -- idempotente: false si ya estaba anulada
END;
$$;

CREATE OR REPLACE FUNCTION public.reasignar_imputacion(
  _id uuid, _obligacion_tipo text, _obligacion_id uuid, _motivo text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.pagos_imputaciones; v_new uuid;
BEGIN
  SELECT * INTO v_row FROM public.pagos_imputaciones WHERE id = _id AND anulado_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Imputación inexistente o ya anulada'; END IF;

  PERFORM public.anular_imputacion(_id, COALESCE(_motivo, 'reasignada'));

  v_new := public.imputar_pago(v_row.pago_origen_tipo, v_row.pago_origen_id,
                               _obligacion_tipo, _obligacion_id, v_row.alumno_id,
                               v_row.monto, v_row.moneda,
                               v_row.metadata || jsonb_build_object('reasignada_desde', _id));
  RETURN v_new;
END;
$$;

-- ---------- 5. VISTAS COMPARATIVAS (paralelas, no reemplazan nada) ----------
CREATE OR REPLACE VIEW public.vw_saldo_legacy AS
SELECT alumno_id,
       moneda,
       SUM(debe)  AS cargos_legacy,
       SUM(haber) AS pagos_legacy,
       SUM(debe - haber) AS saldo_legacy
FROM public.vw_cuenta_corriente_movimientos
GROUP BY alumno_id, moneda;

CREATE OR REPLACE VIEW public.vw_obligaciones_modelo_nuevo AS
SELECT s.alumno_id,
       'suscripcion'::text AS obligacion_tipo,
       s.id AS obligacion_id,
       COALESCE(p.moneda, 'ARS') AS moneda,
       COALESCE(s.precio_final, s.precio_base, p.precio, 0) AS monto,
       public.obligacion_imputado('suscripcion', s.id) AS imputado
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL
UNION ALL
SELECT r.alumno_id,
       'reserva',
       r.id,
       COALESCE(r.currency_snapshot, r.moneda, 'ARS'),
       COALESCE(r.amount_total, 0),
       public.obligacion_imputado('reserva', r.id)
FROM public.event_reservations r
WHERE r.cancelled_at IS NULL
  AND COALESCE(r.reservation_status, '') <> ALL (ARRAY['cancelada','cancelled','rechazada']);

CREATE OR REPLACE VIEW public.vw_saldo_imputaciones AS
SELECT alumno_id,
       moneda,
       SUM(monto) AS cargos_nuevo,
       SUM(imputado) AS imputado_nuevo,
       SUM(monto - imputado) AS saldo_nuevo
FROM public.vw_obligaciones_modelo_nuevo
WHERE alumno_id IS NOT NULL
GROUP BY alumno_id, moneda;

CREATE OR REPLACE VIEW public.vw_saldo_comparacion AS
SELECT COALESCE(l.alumno_id, n.alumno_id) AS alumno_id,
       TRIM(COALESCE(a.nombre,'') || ' ' || COALESCE(a.apellido,'')) AS alumno_nombre,
       COALESCE(l.moneda, n.moneda) AS moneda,
       COALESCE(l.cargos_legacy, 0) AS cargos_legacy,
       COALESCE(l.pagos_legacy, 0) AS pagos_legacy,
       COALESCE(l.saldo_legacy, 0) AS saldo_legacy,
       COALESCE(n.cargos_nuevo, 0) AS cargos_nuevo,
       COALESCE(n.imputado_nuevo, 0) AS imputado_nuevo,
       COALESCE(n.saldo_nuevo, 0) AS saldo_nuevo,
       COALESCE(n.saldo_nuevo, 0) - COALESCE(l.saldo_legacy, 0) AS diferencia
FROM public.vw_saldo_legacy l
FULL JOIN public.vw_saldo_imputaciones n
  ON n.alumno_id = l.alumno_id AND n.moneda = l.moneda
LEFT JOIN public.alumnos a ON a.id = COALESCE(l.alumno_id, n.alumno_id);

-- ---------- 6. MÉTRICAS DE FACTURACIÓN (>= 2026-07-01) ----------
CREATE OR REPLACE FUNCTION public.get_facturacion_metrics(_desde date DEFAULT '2026-07-01')
RETURNS TABLE (
  pendientes int, facturados int, errores int,
  tasa_exito numeric, antiguedad_mas_viejo_horas numeric, monto_pendiente numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*) FILTER (WHERE estado IN ('pendiente','error'))::int,
    COUNT(*) FILTER (WHERE estado = 'facturado')::int,
    COUNT(*) FILTER (WHERE estado = 'error')::int,
    ROUND(100.0 * COUNT(*) FILTER (WHERE estado = 'facturado') / NULLIF(COUNT(*), 0), 2),
    ROUND(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE estado IN ('pendiente','error')))) / 3600.0, 1),
    COALESCE(SUM(monto) FILTER (WHERE estado IN ('pendiente','error')), 0)
  FROM public.facturacion_cola
  WHERE created_at::date >= _desde;
$$;

-- ---------- 7. DETECTOR AJUSTADO ----------
CREATE OR REPLACE VIEW public.vw_pagos_inconsistencias AS
WITH saldo_alumno AS (
  SELECT alumno_id, moneda, SUM(debe - haber) AS saldo
  FROM public.vw_cuenta_corriente_movimientos
  GROUP BY alumno_id, moneda
), nombre AS (
  SELECT id, TRIM(COALESCE(nombre,'') || ' ' || COALESCE(apellido,'')) AS full_name FROM public.alumnos
)
-- 1. MP identificado sin imputar (excluye movimientos internos)
SELECT 'MP_IDENTIFICADO_SIN_IMPUTAR'::text AS tipo, 'alta'::text AS severidad,
  m.alumno_id, n.full_name AS alumno_nombre,
  (m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS fecha,
  m.mp_payment_id, 'mp_account_movements'::text AS pago_origen, m.id AS pago_id,
  m.amount AS monto_pago, m.currency AS moneda,
  NULL::text AS obligacion_tipo, NULL::uuid AS obligacion_id, NULL::numeric AS monto_obligacion,
  NULL::numeric AS pagado, NULL::numeric AS saldo, NULL::numeric AS diferencia,
  'Pago de Mercado Pago con alumno identificado pero sin imputar a ninguna deuda.'::text AS descripcion,
  jsonb_build_object('cuenta_mp_id', m.cuenta_mp_id, 'payer_name', m.payer_name, 'description', m.description) AS metadata
FROM public.mp_account_movements m
LEFT JOIN nombre n ON n.id = m.alumno_id
WHERE m.status = 'approved' AND m.direccion = 'ingreso' AND m.alumno_id IS NOT NULL
  AND m.suscripcion_id IS NULL AND m.reservation_payment_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.pagos_imputaciones pi
                   WHERE pi.pago_origen_tipo = 'mp_movement' AND pi.pago_origen_id = m.id AND pi.anulado_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM public.cuenta_ajustes ca
                   WHERE ca.tipo = 'credito' AND ca.referencia_externa = m.mp_payment_id
                     AND ca.alumno_id = m.alumno_id AND ca.aplicado_a_fuente_id IS NOT NULL)

UNION ALL
-- 2. MP sin identificar (excluye internos y egresos)
SELECT 'MP_SIN_IDENTIFICAR', 'media', NULL::uuid, NULL::text,
  (m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  m.mp_payment_id, 'mp_account_movements', m.id, m.amount, m.currency,
  NULL::text, NULL::uuid, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
  'Ingreso de Mercado Pago sin alumno identificado.',
  jsonb_build_object('cuenta_mp_id', m.cuenta_mp_id, 'payer_name', m.payer_name, 'payer_email', m.payer_email, 'description', m.description)
FROM public.mp_account_movements m
WHERE m.status = 'approved' AND m.direccion = 'ingreso' AND m.direccion <> 'interno' AND m.alumno_id IS NULL

UNION ALL
-- 3a. Suscripción con evidencia de pago pero impaga
SELECT 'PAGO_CONFIRMADO_CON_SALDO_PENDIENTE', 'critica', s.alumno_id, n.full_name, s.fecha_inicio,
  s.mp_payment_id, 'suscripciones', s.id,
  public.subscription_paid_amount(s.id), COALESCE(p.moneda,'ARS'),
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
  AND s.estado IN ('pendiente','pendiente_verificacion','vencida')
  AND public.is_subscription_paid(s.id, s.metodo_pago, s.mp_status, s.origen_registro, s.chequeado_admin, s.mp_payment_id)

UNION ALL
-- 3b. Reserva pagada con saldo abierto
SELECT 'PAGO_CONFIRMADO_CON_SALDO_PENDIENTE', 'critica', r.alumno_id, n.full_name,
  COALESCE(r.confirmed_at::date, r.created_at::date), NULL::text, 'event_reservations', r.id,
  COALESCE(r.amount_paid,0), COALESCE(r.currency_snapshot, r.moneda, 'ARS'),
  'reserva', r.id, COALESCE(r.amount_total,0), COALESCE(r.amount_paid,0),
  COALESCE(r.balance_due,0), COALESCE(r.balance_due,0),
  'La reserva registra pagos que cubren el total pero mantiene saldo pendiente.',
  jsonb_build_object('event_id', r.event_id, 'estado', r.reservation_status)
FROM public.event_reservations r
LEFT JOIN nombre n ON n.id = r.alumno_id
WHERE r.cancelled_at IS NULL
  AND COALESCE(r.reservation_status,'') <> ALL (ARRAY['cancelada','cancelled','rechazada'])
  AND COALESCE(r.amount_paid,0) >= (COALESCE(r.amount_total,0) - 0.01)
  AND COALESCE(r.amount_total,0) > 0 AND COALESCE(r.balance_due,0) > 0.01

UNION ALL
-- 4. Medio de pago contradictorio (saldo_a_favor con trazabilidad NO es contradicción)
SELECT 'MEDIO_PAGO_CONTRADICTORIO', 'media', s.alumno_id, n.full_name, s.fecha_inicio,
  s.mp_payment_id, 'suscripciones', s.id,
  COALESCE(s.precio_final, s.precio_base, p.precio, 0), COALESCE(p.moneda,'ARS'),
  'suscripcion', s.id, COALESCE(s.precio_final, s.precio_base, p.precio, 0),
  public.subscription_paid_amount(s.id), NULL::numeric, NULL::numeric,
  CASE
    WHEN s.mp_payment_id IS NOT NULL THEN 'Tiene una operación real de Mercado Pago vinculada pero el medio informado dice otra cosa.'
    ELSE 'Figura como pagada con Mercado Pago pero no hay operación vinculada.'
  END,
  jsonb_build_object('estado', s.estado, 'metodo_pago', s.metodo_pago, 'mp_status', s.mp_status,
                     'origen_registro', s.origen_registro, 'plan', p.nombre)
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN nombre n ON n.id = s.alumno_id
WHERE s.cancelada_at IS NULL
  AND COALESCE(s.metodo_pago,'') <> 'saldo_a_favor'
  AND (
    (s.mp_payment_id IS NOT NULL AND COALESCE(s.metodo_pago,'pendiente') IN ('efectivo','transferencia','pendiente','manual'))
    OR (COALESCE(s.metodo_pago,'') = 'mercadopago' AND s.mp_payment_id IS NULL)
  )

UNION ALL
-- 5. Importe distinto al saldo: SOLO advertencia / revisión
SELECT 'IMPORTE_PAGO_DIFERENTE_A_SALDO', 'baja', m.alumno_id, n.full_name,
  (m.fecha_movimiento AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  m.mp_payment_id, 'mp_account_movements', m.id, m.amount, m.currency,
  'suscripcion', s.id, COALESCE(s.precio_final, s.precio_base, p.precio, 0), m.amount,
  COALESCE(s.precio_final, s.precio_base, p.precio, 0) - m.amount,
  m.amount - COALESCE(s.precio_final, s.precio_base, p.precio, 0),
  'Revisión: el importe no coincide con la obligación. Puede ser pago parcial, excedente, familiar, comisión o saldo a favor.',
  jsonb_build_object('plan', p.nombre, 'estado', s.estado, 'metodo_pago', s.metodo_pago,
                     'comparison_confidence', 'low',
                     'nota', 'Se compara contra el importe actual de la obligación; no se puede reconstruir el saldo previo a la imputación.')
FROM public.mp_account_movements m
JOIN public.suscripciones s ON s.id = m.suscripcion_id
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN nombre n ON n.id = m.alumno_id
WHERE m.status = 'approved' AND s.cancelada_at IS NULL
  AND ABS(m.amount - COALESCE(s.precio_final, s.precio_base, p.precio, 0)) > 1

UNION ALL
-- 6a. Mismo MP en más de una suscripción
SELECT 'CREDITO_MP_DUPLICADO', 'critica', s.alumno_id, n.full_name, s.fecha_inicio,
  s.mp_payment_id, 'suscripciones', s.id, COALESCE(s.precio_final, s.precio_base, 0), COALESCE(p.moneda,'ARS'),
  'suscripcion', s.id, COALESCE(s.precio_final, s.precio_base, 0), public.subscription_paid_amount(s.id),
  NULL::numeric, NULL::numeric,
  'El mismo pago de Mercado Pago está vinculado a más de una suscripción.',
  jsonb_build_object('plan', p.nombre, 'estado', s.estado,
    'suscripciones_con_ese_pago', (SELECT jsonb_agg(s2.id) FROM public.suscripciones s2
                                    WHERE s2.mp_payment_id = s.mp_payment_id AND s2.cancelada_at IS NULL))
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN nombre n ON n.id = s.alumno_id
WHERE s.mp_payment_id IS NOT NULL AND s.cancelada_at IS NULL
  AND (SELECT count(*) FROM public.suscripciones s3 WHERE s3.mp_payment_id = s.mp_payment_id AND s3.cancelada_at IS NULL) > 1

UNION ALL
-- 6b. Crédito duplicado en cuenta corriente
SELECT 'CREDITO_MP_DUPLICADO', 'critica', ca.alumno_id, n.full_name, ca.fecha,
  ca.referencia_externa, 'cuenta_ajustes', ca.id, ca.monto, COALESCE(ca.moneda,'ARS'),
  'credito', ca.id, ca.monto, ca.monto, NULL::numeric, NULL::numeric,
  'Hay más de un crédito en cuenta corriente para la misma operación de Mercado Pago.',
  jsonb_build_object('concepto', ca.concepto, 'aplicado_a', ca.aplicado_a_fuente_tabla)
FROM public.cuenta_ajustes ca
LEFT JOIN nombre n ON n.id = ca.alumno_id
WHERE ca.tipo = 'credito' AND ca.referencia_externa IS NOT NULL
  AND (SELECT count(*) FROM public.cuenta_ajustes c2
        WHERE c2.tipo = 'credito' AND c2.referencia_externa = ca.referencia_externa AND c2.alumno_id = ca.alumno_id) > 1

UNION ALL
-- 7. Crédito sin aplicar con deuda abierta
SELECT 'CREDITO_MP_SIN_APLICAR_CON_DEUDA', 'alta', ca.alumno_id, n.full_name, ca.fecha,
  ca.referencia_externa, 'cuenta_ajustes', ca.id, ca.monto, COALESCE(ca.moneda,'ARS'),
  NULL::text, NULL::uuid, NULL::numeric, NULL::numeric, sa.saldo, LEAST(ca.monto, sa.saldo),
  'El alumno tiene un crédito sin aplicar y al mismo tiempo deuda abierta.',
  jsonb_build_object('concepto', ca.concepto, 'medio_pago', ca.medio_pago, 'saldo_alumno', sa.saldo)
FROM public.cuenta_ajustes ca
LEFT JOIN nombre n ON n.id = ca.alumno_id
JOIN saldo_alumno sa ON sa.alumno_id = ca.alumno_id AND sa.moneda = COALESCE(ca.moneda,'ARS')
WHERE ca.tipo = 'credito' AND ca.aplicado_a_fuente_id IS NULL AND sa.saldo > 0.01

UNION ALL
-- 8. Facturación estancada: solo desde 2026-07-01, severidad por antigüedad real
SELECT 'FACTURACION_ESTANCADA',
  CASE
    WHEN fc.created_at < now() - interval '7 days' THEN 'critica'
    WHEN fc.created_at < now() - interval '3 days' THEN 'alta'
    ELSE 'media'
  END,
  fc.alumno_id, COALESCE(n.full_name, fc.cliente_nombre),
  COALESCE(fc.pagado_at::date, fc.created_at::date), fc.pago_id, 'facturacion_cola', fc.id,
  fc.monto, COALESCE(fc.moneda,'ARS'), fc.referencia_tipo, fc.referencia_id, fc.monto,
  NULL::numeric, NULL::numeric, NULL::numeric,
  'Pago cobrado sin factura emitida (antigüedad ' ||
    ROUND(EXTRACT(EPOCH FROM (now() - fc.created_at)) / 3600.0)::text || ' h).',
  jsonb_build_object('estado', fc.estado, 'concepto', fc.concepto, 'segmento', fc.segmento,
                     'motivo_arrastre', fc.motivo_arrastre,
                     'horas_pendiente', ROUND(EXTRACT(EPOCH FROM (now() - fc.created_at)) / 3600.0))
FROM public.facturacion_cola fc
LEFT JOIN nombre n ON n.id = fc.alumno_id
WHERE fc.estado IN ('pendiente','error')
  AND fc.created_at::date >= DATE '2026-07-01'
  AND fc.created_at < now() - interval '24 hours';

COMMENT ON VIEW public.vw_pagos_inconsistencias IS
  'Detector de sólo lectura. El monto por categoría es informativo: una misma operación puede aparecer en más de una regla, por lo que un total global debe deduplicarse por pago_id/mp_payment_id.';
