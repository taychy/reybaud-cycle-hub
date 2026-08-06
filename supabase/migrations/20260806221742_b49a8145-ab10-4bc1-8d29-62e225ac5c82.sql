-- 1. Verification fields for store orders
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS verificado_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verificado_admin_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificado_admin_by uuid,
  ADD COLUMN IF NOT EXISTS verificado_nota text;

-- 2. Helper: is a payment method auto-reconciled (MP / gateway)?
CREATE OR REPLACE FUNCTION public.is_metodo_auto_conciliado(_metodo text, _mp_payment_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(_mp_payment_id, '') <> ''
      OR lower(COALESCE(_metodo, '')) IN ('mercadopago','mercado_pago','mp','tarjeta','debito','credito','online');
$$;

-- 3. Unified reconciliation view
CREATE OR REPLACE VIEW public.vw_conciliacion_pagos AS
-- Suscripciones (mensualidades / programas)
SELECT
  'suscripcion'::text                              AS fuente,
  s.id                                             AS registro_id,
  s.alumno_id                                      AS alumno_id,
  a.nombre                                         AS alumno_nombre,
  s.precio_final                                   AS monto,
  'ARS'::text                                      AS moneda,
  COALESCE(s.updated_at, s.created_at)             AS fecha,
  s.metodo_pago                                    AS metodo_pago,
  s.origen_registro                                AS origen,
  s.mp_payment_id                                  AS mp_payment_id,
  s.estado                                         AS estado_origen,
  CASE
    WHEN s.estado NOT IN ('activa','finalizada') THEN 'no_aplica'
    WHEN public.is_metodo_auto_conciliado(s.metodo_pago, s.mp_payment_id) THEN 'auto_conciliado'
    WHEN s.chequeado_admin THEN 'verificado'
    ELSE 'por_verificar'
  END                                              AS estado_conciliacion,
  s.chequeado_admin                                AS verificado,
  s.chequeado_admin_at                             AS verificado_at,
  s.chequeado_admin_by                             AS verificado_by,
  ('Mensualidad ' || to_char(s.fecha_inicio, 'MM/YYYY'))::text AS descripcion
FROM public.suscripciones s
LEFT JOIN public.alumnos a ON a.id = s.alumno_id

UNION ALL

-- Pagos de eventos / viajes
SELECT
  'evento'::text,
  rp.id,
  rp.alumno_id,
  a.nombre,
  rp.amount,
  COALESCE(rp.currency, 'ARS'),
  COALESCE(rp.payment_date::timestamptz, rp.created_at),
  rp.payment_method,
  NULL::text,
  rp.mp_payment_id,
  rp.status,
  CASE
    WHEN rp.anulado_at IS NOT NULL OR COALESCE(rp.status,'') = 'rechazado' THEN 'no_aplica'
    WHEN public.is_metodo_auto_conciliado(rp.payment_method, rp.mp_payment_id) THEN 'auto_conciliado'
    WHEN rp.reviewed_at IS NOT NULL THEN 'verificado'
    ELSE 'por_verificar'
  END,
  (rp.reviewed_at IS NOT NULL),
  rp.reviewed_at,
  rp.reviewed_by,
  COALESCE('Pago evento ' || e.title, 'Pago evento')
FROM public.reservation_payments rp
LEFT JOIN public.alumnos a ON a.id = rp.alumno_id
LEFT JOIN public.event_reservations er ON er.id = rp.reservation_id
LEFT JOIN public.events e ON e.id = er.event_id

UNION ALL

-- Pedidos de tienda pagados
SELECT
  'tienda'::text,
  o.id,
  o.alumno_id,
  COALESCE(a.nombre, o.customer_name),
  o.total,
  COALESCE(o.currency, 'ARS'),
  COALESCE(o.pagado_at, o.created_at),
  o.metodo_pago,
  o.origen_registro,
  o.mp_payment_id,
  o.status,
  CASE
    WHEN o.cancelled_at IS NOT NULL OR o.pagado_at IS NULL THEN 'no_aplica'
    WHEN public.is_metodo_auto_conciliado(o.metodo_pago, o.mp_payment_id) THEN 'auto_conciliado'
    WHEN o.verificado_admin THEN 'verificado'
    ELSE 'por_verificar'
  END,
  o.verificado_admin,
  o.verificado_admin_at,
  o.verificado_admin_by,
  ('Pedido tienda #' || o.order_number)::text
FROM public.store_orders o
LEFT JOIN public.alumnos a ON a.id = o.alumno_id;

GRANT SELECT ON public.vw_conciliacion_pagos TO authenticated;
GRANT SELECT ON public.vw_conciliacion_pagos TO service_role;

-- 4. Unified verification RPC
CREATE OR REPLACE FUNCTION public.marcar_pago_verificado(
  _fuente text,
  _registro_id uuid,
  _verificado boolean DEFAULT true,
  _nota text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_uid, 'admin')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF _fuente = 'suscripcion' THEN
    UPDATE public.suscripciones
       SET chequeado_admin = _verificado,
           chequeado_admin_at = CASE WHEN _verificado THEN now() ELSE NULL END,
           chequeado_admin_by = CASE WHEN _verificado THEN _uid ELSE NULL END
     WHERE id = _registro_id;
  ELSIF _fuente = 'evento' THEN
    UPDATE public.reservation_payments
       SET reviewed_at = CASE WHEN _verificado THEN now() ELSE NULL END,
           reviewed_by = CASE WHEN _verificado THEN _uid ELSE NULL END,
           review_notes = COALESCE(_nota, review_notes)
     WHERE id = _registro_id;
  ELSIF _fuente = 'tienda' THEN
    UPDATE public.store_orders
       SET verificado_admin = _verificado,
           verificado_admin_at = CASE WHEN _verificado THEN now() ELSE NULL END,
           verificado_admin_by = CASE WHEN _verificado THEN _uid ELSE NULL END,
           verificado_nota = COALESCE(_nota, verificado_nota)
     WHERE id = _registro_id;
  ELSE
    RAISE EXCEPTION 'Fuente desconocida: %', _fuente;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_pago_verificado(text, uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.marcar_pago_verificado(text, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_pago_verificado(text, uuid, boolean, text) TO service_role;