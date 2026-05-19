
-- ============================================
-- MVP Cuenta Corriente v1
-- ============================================

-- 1. Tabla de ajustes manuales
CREATE TABLE public.cuenta_ajustes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('cargo','credito')),
  concepto TEXT NOT NULL,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  moneda TEXT NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD','EUR')),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cuenta_ajustes_alumno ON public.cuenta_ajustes(alumno_id, fecha DESC);

ALTER TABLE public.cuenta_ajustes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all ajustes"
  ON public.cuenta_ajustes FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can insert ajustes"
  ON public.cuenta_ajustes FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can update ajustes"
  ON public.cuenta_ajustes FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can delete ajustes"
  ON public.cuenta_ajustes FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_cuenta_ajustes_updated_at
  BEFORE UPDATE ON public.cuenta_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Vista unificada de movimientos
CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS
-- Cargos de suscripciones (no canceladas)
SELECT
  s.alumno_id,
  COALESCE(s.fecha_inicio, s.created_at::date) AS fecha,
  'cargo_suscripcion'::text AS tipo,
  ('Plan: ' || COALESCE(p.nombre, '—')) AS concepto,
  'suscripciones'::text AS fuente_tabla,
  s.id AS fuente_id,
  COALESCE(s.precio_final, s.precio_base, p.precio, 0)::numeric AS debe,
  0::numeric AS haber,
  COALESCE(p.moneda, 'ARS') AS moneda,
  s.estado::text AS estado,
  jsonb_build_object('plan_id', s.plan_id, 'plan_nombre', p.nombre) AS referencia_extra
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL
  AND s.estado <> 'cancelada'

UNION ALL

-- Pagos de suscripciones (cuando está activa o en verificación y hay método de pago)
SELECT
  s.alumno_id,
  s.updated_at::date AS fecha,
  'pago_suscripcion'::text AS tipo,
  ('Pago plan: ' || COALESCE(p.nombre, '—') ||
   CASE WHEN s.metodo_pago IS NOT NULL THEN ' (' || s.metodo_pago || ')' ELSE '' END) AS concepto,
  'suscripciones'::text AS fuente_tabla,
  s.id AS fuente_id,
  0::numeric AS debe,
  COALESCE(s.precio_final, s.precio_base, p.precio, 0)::numeric AS haber,
  COALESCE(p.moneda, 'ARS') AS moneda,
  s.estado::text AS estado,
  jsonb_build_object(
    'plan_id', s.plan_id,
    'plan_nombre', p.nombre,
    'metodo_pago', s.metodo_pago,
    'origen_registro', s.origen_registro,
    'mp_payment_id', s.mp_payment_id
  ) AS referencia_extra
FROM public.suscripciones s
LEFT JOIN public.planes p ON p.id = s.plan_id
WHERE s.cancelada_at IS NULL
  AND s.estado IN ('activa','pendiente_verificacion')
  AND s.metodo_pago IS NOT NULL

UNION ALL

-- Cargos de reservas (cuotas)
SELECT
  er.alumno_id,
  COALESCE(ri.due_date, er.created_at::date) AS fecha,
  'cargo_reserva'::text AS tipo,
  (COALESCE(e.title, 'Evento') ||
   CASE WHEN ri.label IS NOT NULL THEN ' — ' || ri.label
        ELSE ' — Cuota ' || ri.installment_number::text END) AS concepto,
  'reservation_installments'::text AS fuente_tabla,
  ri.id AS fuente_id,
  COALESCE(ri.amount, 0)::numeric AS debe,
  0::numeric AS haber,
  COALESCE(ri.currency, er.currency_snapshot, e.currency, 'ARS') AS moneda,
  ri.status::text AS estado,
  jsonb_build_object(
    'reservation_id', er.id,
    'event_id', er.event_id,
    'event_title', e.title,
    'installment_number', ri.installment_number,
    'condoned_amount', ri.condoned_amount
  ) AS referencia_extra
FROM public.reservation_installments ri
JOIN public.event_reservations er ON er.id = ri.reservation_id
LEFT JOIN public.events e ON e.id = er.event_id
WHERE er.alumno_id IS NOT NULL

UNION ALL

-- Pagos validados de reservas
SELECT
  rp.alumno_id,
  COALESCE(rp.payment_date::date, rp.created_at::date) AS fecha,
  'pago_reserva'::text AS tipo,
  ('Pago ' || COALESCE(e.title, 'Evento') ||
   CASE WHEN rp.payment_method IS NOT NULL THEN ' (' || rp.payment_method || ')' ELSE '' END) AS concepto,
  'reservation_payments'::text AS fuente_tabla,
  rp.id AS fuente_id,
  0::numeric AS debe,
  COALESCE(rp.equivalent_amount_event_currency, rp.amount, 0)::numeric AS haber,
  COALESCE(rp.event_currency, rp.currency, 'ARS') AS moneda,
  rp.status::text AS estado,
  jsonb_build_object(
    'reservation_id', rp.reservation_id,
    'event_id', er.event_id,
    'event_title', e.title,
    'payment_method', rp.payment_method,
    'installment_id', rp.installment_id,
    'original_amount', rp.original_amount,
    'original_currency', rp.original_currency
  ) AS referencia_extra
FROM public.reservation_payments rp
LEFT JOIN public.event_reservations er ON er.id = rp.reservation_id
LEFT JOIN public.events e ON e.id = er.event_id
WHERE rp.alumno_id IS NOT NULL
  AND rp.status = 'validado'
  AND rp.anulado_at IS NULL

UNION ALL

-- Ajustes manuales: cargo
SELECT
  ca.alumno_id,
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
FROM public.cuenta_ajustes ca
WHERE ca.tipo = 'cargo'

UNION ALL

-- Ajustes manuales: crédito
SELECT
  ca.alumno_id,
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
FROM public.cuenta_ajustes ca
WHERE ca.tipo = 'credito';

-- 3. RPC para saldo agrupado por moneda
CREATE OR REPLACE FUNCTION public.get_saldo_alumno(p_alumno_id UUID)
RETURNS TABLE(moneda TEXT, total_cargos NUMERIC, total_pagos NUMERIC, saldo NUMERIC)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT
    m.moneda,
    COALESCE(SUM(m.debe), 0)::numeric AS total_cargos,
    COALESCE(SUM(m.haber), 0)::numeric AS total_pagos,
    (COALESCE(SUM(m.debe), 0) - COALESCE(SUM(m.haber), 0))::numeric AS saldo
  FROM public.vw_cuenta_corriente_movimientos m
  WHERE m.alumno_id = p_alumno_id
  GROUP BY m.moneda
  ORDER BY m.moneda;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saldo_alumno(UUID) TO authenticated;
