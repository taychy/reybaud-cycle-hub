-- 1) Autorización de cancelación: admin, depósito o super admin (nunca castear 'super_admin' a app_role)
CREATE OR REPLACE FUNCTION public.cancel_store_order(_order_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT (
    public.has_role(v_uid,'admin'::app_role)
    OR public.has_role(v_uid,'deposito'::app_role)
    OR public.is_super_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'El motivo de cancelación es obligatorio';
  END IF;
  RETURN public._cancel_store_order_core(_order_id, btrim(_reason), v_uid);
END;
$function$;

-- 2) devoluciones.store_order_id
ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS store_order_id uuid NULL REFERENCES public.store_orders(id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_store_order_id
  ON public.devoluciones(store_order_id) WHERE store_order_id IS NOT NULL;

-- 3) registrar_devolucion con origen tienda opcional
DROP FUNCTION IF EXISTS public.registrar_devolucion(uuid, numeric, text, text, text, date, text, text, uuid, uuid, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.registrar_devolucion(
  p_alumno_id uuid,
  p_monto numeric,
  p_moneda text DEFAULT 'ARS'::text,
  p_motivo text DEFAULT 'Devolución'::text,
  p_metodo text DEFAULT 'transferencia'::text,
  p_fecha date DEFAULT CURRENT_DATE,
  p_referencia text DEFAULT NULL::text,
  p_notas text DEFAULT NULL::text,
  p_suscripcion_id uuid DEFAULT NULL::uuid,
  p_baja_solicitud_id uuid DEFAULT NULL::uuid,
  p_mp_movement_id uuid DEFAULT NULL::uuid,
  p_cuenta_mp_id uuid DEFAULT NULL::uuid,
  p_reservation_id uuid DEFAULT NULL::uuid,
  p_reservation_payment_id uuid DEFAULT NULL::uuid,
  p_store_order_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_devolucion_id uuid;
  v_mp record;
  v_rp record;
  v_so record;
  v_res_alumno uuid;
  v_reservation_id uuid := p_reservation_id;
  v_cuenta_mp_id uuid := p_cuenta_mp_id;
  v_referencia text := p_referencia;
  v_devuelto numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Solo admin puede registrar devoluciones';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  IF p_alumno_id IS NULL THEN
    RAISE EXCEPTION 'Falta el alumno';
  END IF;

  IF p_mp_movement_id IS NOT NULL THEN
    SELECT * INTO v_mp FROM public.mp_account_movements WHERE id = p_mp_movement_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El movimiento de Mercado Pago no existe';
    END IF;
    IF v_mp.direccion <> 'egreso' THEN
      RAISE EXCEPTION 'El movimiento de Mercado Pago no es un egreso';
    END IF;
    IF v_mp.gasto_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ese egreso ya fue convertido en gasto';
    END IF;
    IF EXISTS (SELECT 1 FROM public.devoluciones d WHERE d.mp_movement_id = p_mp_movement_id) THEN
      RAISE EXCEPTION 'Ese egreso ya está vinculado a otra devolución';
    END IF;
    IF COALESCE(v_mp.currency, 'ARS') <> COALESCE(p_moneda, 'ARS') THEN
      RAISE EXCEPTION 'La moneda no coincide con el egreso de Mercado Pago';
    END IF;
    IF abs(abs(v_mp.amount) - p_monto) > 1 THEN
      RAISE EXCEPTION 'El monto no coincide con el egreso de Mercado Pago (% vs %)', abs(v_mp.amount), p_monto;
    END IF;
    v_cuenta_mp_id := COALESCE(v_cuenta_mp_id, v_mp.cuenta_mp_id);
    v_referencia := COALESCE(v_referencia, v_mp.mp_payment_id);
  END IF;

  IF p_reservation_payment_id IS NOT NULL THEN
    SELECT * INTO v_rp FROM public.reservation_payments WHERE id = p_reservation_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El pago de reserva no existe';
    END IF;
    v_reservation_id := COALESCE(v_reservation_id, v_rp.reservation_id);
    IF v_rp.reservation_id IS DISTINCT FROM v_reservation_id THEN
      RAISE EXCEPTION 'El pago no pertenece a la reserva indicada';
    END IF;
  END IF;

  IF v_reservation_id IS NOT NULL THEN
    SELECT er.alumno_id INTO v_res_alumno FROM public.event_reservations er WHERE er.id = v_reservation_id;
    IF v_res_alumno IS NULL THEN
      RAISE EXCEPTION 'La reserva no existe';
    END IF;
    IF v_res_alumno <> p_alumno_id THEN
      RAISE EXCEPTION 'La reserva pertenece a otro alumno';
    END IF;
  END IF;

  IF p_suscripcion_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.suscripciones s WHERE s.id = p_suscripcion_id AND s.alumno_id = p_alumno_id) THEN
      RAISE EXCEPTION 'La suscripción pertenece a otro alumno';
    END IF;
  END IF;

  IF p_store_order_id IS NOT NULL THEN
    SELECT * INTO v_so FROM public.store_orders WHERE id = p_store_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El pedido de tienda no existe';
    END IF;
    IF v_so.alumno_id IS DISTINCT FROM p_alumno_id THEN
      RAISE EXCEPTION 'El pedido pertenece a otro alumno';
    END IF;
    IF COALESCE(v_so.currency, 'ARS') <> COALESCE(p_moneda, 'ARS') THEN
      RAISE EXCEPTION 'La moneda no coincide con la del pedido (% vs %)', COALESCE(v_so.currency,'ARS'), COALESCE(p_moneda,'ARS');
    END IF;
    IF COALESCE(v_so.status, '') NOT IN ('cancelado', 'cancelada') THEN
      RAISE EXCEPTION 'Solo se puede registrar la devolución de un pedido cancelado';
    END IF;
    IF v_so.pagado_at IS NULL THEN
      RAISE EXCEPTION 'El pedido no registra pago: no corresponde devolución';
    END IF;
    SELECT COALESCE(sum(d.monto), 0) INTO v_devuelto
      FROM public.devoluciones d WHERE d.store_order_id = p_store_order_id;
    IF v_devuelto + p_monto > COALESCE(v_so.total, 0) + 0.01 THEN
      RAISE EXCEPTION 'La devolución supera el total del pedido (ya devuelto %, total %)', v_devuelto, COALESCE(v_so.total, 0);
    END IF;
  END IF;

  INSERT INTO public.devoluciones (
    alumno_id, suscripcion_id, monto, moneda, fecha, metodo, referencia,
    motivo, notas, baja_solicitud_id, created_by,
    mp_movement_id, cuenta_mp_id, reservation_id, reservation_payment_id, store_order_id
  ) VALUES (
    p_alumno_id, p_suscripcion_id, p_monto, COALESCE(p_moneda, 'ARS'), COALESCE(p_fecha, CURRENT_DATE),
    COALESCE(p_metodo, 'transferencia'), v_referencia,
    COALESCE(p_motivo, 'Devolución'), p_notas, p_baja_solicitud_id, auth.uid(),
    p_mp_movement_id, v_cuenta_mp_id, v_reservation_id, p_reservation_payment_id, p_store_order_id
  ) RETURNING id INTO v_devolucion_id;

  INSERT INTO public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'admin', 'registrar_devolucion', 'devoluciones', v_devolucion_id::text,
    jsonb_build_object(
      'alumno_id', p_alumno_id,
      'monto', p_monto,
      'moneda', COALESCE(p_moneda, 'ARS'),
      'metodo', COALESCE(p_metodo, 'transferencia'),
      'referencia', v_referencia,
      'motivo', p_motivo,
      'mp_movement_id', p_mp_movement_id,
      'cuenta_mp_id', v_cuenta_mp_id,
      'reservation_id', v_reservation_id,
      'reservation_payment_id', p_reservation_payment_id,
      'suscripcion_id', p_suscripcion_id,
      'store_order_id', p_store_order_id
    )
  );

  RETURN v_devolucion_id;
END;
$function$;

-- 4) Vistas
DO $do$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass, true);

  v_new := replace(
    v_def,
    'WHERE so.alumno_id IS NOT NULL AND COALESCE(so.status, ''''::text) <> ''cancelada''::text',
    'WHERE so.alumno_id IS NOT NULL AND COALESCE(so.status, ''''::text) <> ALL (ARRAY[''cancelada''::text, ''cancelado''::text]) AND so.cancelled_at IS NULL'
  );
  IF v_new = v_def THEN RAISE EXCEPTION 'No se pudo ajustar el filtro de cargo_tienda'; END IF;
  v_def := v_new;

  v_new := replace(
    v_def,
    '''suscripcion_id'', d.suscripcion_id, ''evento_nombre'', e.title',
    '''suscripcion_id'', d.suscripcion_id, ''store_order_id'', d.store_order_id, ''store_order_number'', so2.order_number, ''evento_nombre'', e.title'
  );
  IF v_new = v_def THEN RAISE EXCEPTION 'No se pudo ajustar referencia_extra de devoluciones'; END IF;
  v_def := v_new;

  v_new := replace(
    v_def,
    'LEFT JOIN events e ON e.id = er.event_id;',
    'LEFT JOIN events e ON e.id = er.event_id
     LEFT JOIN store_orders so2 ON so2.id = d.store_order_id;'
  );
  IF v_new = v_def THEN RAISE EXCEPTION 'No se pudo agregar el join de store_orders en devoluciones'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS ' || v_new;
END
$do$;

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_viewdef('public.vw_backfill_obligaciones'::regclass, true);
  v_new := replace(
    v_def,
    'FROM store_orders o
  WHERE COALESCE(o.total, 0::numeric) > 0::numeric',
    'FROM store_orders o
  WHERE COALESCE(o.total, 0::numeric) > 0::numeric AND o.cancelled_at IS NULL AND COALESCE(o.status, ''''::text) <> ALL (ARRAY[''cancelada''::text, ''cancelado''::text])'
  );
  IF v_new = v_def THEN RAISE EXCEPTION 'No se pudo ajustar vw_backfill_obligaciones'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_backfill_obligaciones AS ' || v_new;
END
$do$;