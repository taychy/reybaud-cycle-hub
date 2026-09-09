-- A) MODELO devoluciones
ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS mp_movement_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_mp_id uuid,
  ADD COLUMN IF NOT EXISTS reservation_id uuid,
  ADD COLUMN IF NOT EXISTS reservation_payment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devoluciones_mp_movement_id_fkey') THEN
    ALTER TABLE public.devoluciones
      ADD CONSTRAINT devoluciones_mp_movement_id_fkey FOREIGN KEY (mp_movement_id)
      REFERENCES public.mp_account_movements(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devoluciones_mp_movement_id_key') THEN
    ALTER TABLE public.devoluciones
      ADD CONSTRAINT devoluciones_mp_movement_id_key UNIQUE (mp_movement_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devoluciones_cuenta_mp_id_fkey') THEN
    ALTER TABLE public.devoluciones
      ADD CONSTRAINT devoluciones_cuenta_mp_id_fkey FOREIGN KEY (cuenta_mp_id)
      REFERENCES public.cuentas_mp(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devoluciones_reservation_id_fkey') THEN
    ALTER TABLE public.devoluciones
      ADD CONSTRAINT devoluciones_reservation_id_fkey FOREIGN KEY (reservation_id)
      REFERENCES public.event_reservations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devoluciones_reservation_payment_id_fkey') THEN
    ALTER TABLE public.devoluciones
      ADD CONSTRAINT devoluciones_reservation_payment_id_fkey FOREIGN KEY (reservation_payment_id)
      REFERENCES public.reservation_payments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_devoluciones_mp_movement ON public.devoluciones(mp_movement_id) WHERE mp_movement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devoluciones_reservation ON public.devoluciones(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devoluciones_suscripcion ON public.devoluciones(suscripcion_id) WHERE suscripcion_id IS NOT NULL;

-- B) registrar_devolucion: reembolso real, sin crédito espejo
DROP FUNCTION IF EXISTS public.registrar_devolucion(uuid, numeric, text, text, text, date, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.registrar_devolucion(
  p_alumno_id uuid,
  p_monto numeric,
  p_moneda text DEFAULT 'ARS',
  p_motivo text DEFAULT 'Devolución',
  p_metodo text DEFAULT 'transferencia',
  p_fecha date DEFAULT CURRENT_DATE,
  p_referencia text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_suscripcion_id uuid DEFAULT NULL,
  p_baja_solicitud_id uuid DEFAULT NULL,
  p_mp_movement_id uuid DEFAULT NULL,
  p_cuenta_mp_id uuid DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_reservation_payment_id uuid DEFAULT NULL
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
  v_res_alumno uuid;
  v_reservation_id uuid := p_reservation_id;
  v_cuenta_mp_id uuid := p_cuenta_mp_id;
  v_referencia text := p_referencia;
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

  INSERT INTO public.devoluciones (
    alumno_id, suscripcion_id, monto, moneda, fecha, metodo, referencia,
    motivo, notas, baja_solicitud_id, created_by,
    mp_movement_id, cuenta_mp_id, reservation_id, reservation_payment_id
  ) VALUES (
    p_alumno_id, p_suscripcion_id, p_monto, COALESCE(p_moneda, 'ARS'), COALESCE(p_fecha, CURRENT_DATE),
    COALESCE(p_metodo, 'transferencia'), v_referencia,
    COALESCE(p_motivo, 'Devolución'), p_notas, p_baja_solicitud_id, auth.uid(),
    p_mp_movement_id, v_cuenta_mp_id, v_reservation_id, p_reservation_payment_id
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
      'suscripcion_id', p_suscripcion_id
    )
  );

  RETURN v_devolucion_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_devolucion(uuid, numeric, text, text, text, date, text, text, uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated;

-- D) pago_consumido_legacy: reconocer pagos MP usados en reservas
CREATE OR REPLACE FUNCTION public.pago_consumido_legacy(_tipo text, _id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE _tipo
    WHEN 'mp_movement' THEN (
      EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        JOIN public.suscripciones s ON s.id = mp.suscripcion_id
        WHERE mp.id = _id
          AND s.cancelada_at IS NULL
          AND s.estado IN ('activa','pendiente_verificacion','vencida','finalizada','conciliado')
          AND public.is_subscription_paid(s.id)
      )
      OR EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        JOIN public.reservation_payments rp ON rp.id = mp.reservation_payment_id
        WHERE mp.id = _id
          AND rp.anulado_at IS NULL
          AND COALESCE(rp.status, '') <> 'rechazado'
      )
      OR EXISTS (
        SELECT 1 FROM public.mp_account_movements mp
        JOIN public.reservation_payments rp
          ON rp.alumno_id = mp.alumno_id
         AND (rp.mp_payment_id = mp.mp_payment_id OR rp.payment_reference = mp.mp_payment_id)
        WHERE mp.id = _id
          AND rp.anulado_at IS NULL
          AND rp.status = 'validado'
          AND COALESCE(rp.currency, 'ARS') = COALESCE(mp.currency, 'ARS')
          AND abs(COALESCE(rp.amount, 0) - abs(mp.amount)) <= 1
      )
    )
    ELSE false
  END;
$function$;

-- C) Cuenta corriente: agregar tipo devolucion (DEBE)
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass, true) INTO v;
  IF position('''devolucion''::text AS tipo' IN v) = 0 THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos AS '
      || rtrim(rtrim(v), ';')
      || $q$
UNION ALL
 SELECT d.alumno_id,
    d.fecha,
    'devolucion'::text AS tipo,
    ('Devolución — '::text || COALESCE(d.motivo, 'reintegro'::text)) ||
      CASE WHEN e.title IS NOT NULL THEN ' — '::text || e.title ELSE ''::text END AS concepto,
    'devoluciones'::text AS fuente_tabla,
    d.id AS fuente_id,
    d.monto AS debe,
    0::numeric AS haber,
    d.moneda,
    'devuelto'::text AS estado,
    jsonb_build_object(
      'medio_pago', d.metodo,
      'referencia_externa', d.referencia,
      'mp_payment_id', mp.mp_payment_id,
      'mp_movement_id', d.mp_movement_id,
      'cuenta_mp_id', d.cuenta_mp_id,
      'reservation_id', d.reservation_id,
      'reservation_payment_id', d.reservation_payment_id,
      'suscripcion_id', d.suscripcion_id,
      'evento_nombre', e.title,
      'motivo', d.motivo,
      'notas', d.notas,
      'fecha_pago', d.fecha
    ) AS referencia_extra
   FROM devoluciones d
     LEFT JOIN mp_account_movements mp ON mp.id = d.mp_movement_id
     LEFT JOIN event_reservations er ON er.id = d.reservation_id
     LEFT JOIN events e ON e.id = er.event_id
$q$;
  END IF;
END $$;