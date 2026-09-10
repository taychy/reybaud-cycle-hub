CREATE OR REPLACE FUNCTION public.get_alumno_payment_targets(_alumno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Suscripciones: para las que están en estado 'pendiente' NO se usa la
  -- presunción de pago (metodo_pago + origen_registro) de
  -- subscription_paid_amount(), porque la renovación automática precarga
  -- 'efectivo'/'cargado_admin' sin cobro real y eso ocultaba la deuda.
  -- Para 'pendiente' se cuenta sólo evidencia concreta: movimientos MP
  -- aprobados, créditos de cuenta corriente aplicados e imputaciones activas.
  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'fecha' DESC), '[]'::jsonb) INTO v_subs
  FROM (
    SELECT jsonb_build_object(
      'id', su.id, 'label', COALESCE(p.nombre, 'Plan'),
      'currency', COALESCE(p.moneda, 'ARS'),
      'total', COALESCE(su.precio_final, su.precio_base, p.precio, 0),
      'paid', pagado.monto,
      'balance', COALESCE(su.precio_final, su.precio_base, p.precio, 0) - pagado.monto,
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
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN su.estado = 'pendiente' THEN
          COALESCE((SELECT SUM(mp.amount) FROM public.mp_account_movements mp
                     WHERE mp.suscripcion_id = su.id AND mp.status = 'approved'), 0)
          + COALESCE((SELECT SUM(ca.monto) FROM public.cuenta_ajustes ca
                       WHERE ca.tipo = 'credito'
                         AND ca.aplicado_a_fuente_tabla = 'suscripciones'
                         AND ca.aplicado_a_fuente_id = su.id), 0)
          + public.obligacion_imputado('suscripcion', su.id)
        ELSE
          public.subscription_paid_amount(su.id)
          + public.obligacion_imputado('suscripcion', su.id)
      END AS monto
    ) pagado
    WHERE su.alumno_id = _alumno_id AND su.cancelada_at IS NULL
      AND su.estado IN ('pendiente', 'pendiente_verificacion', 'vencida', 'activa')
      AND (COALESCE(su.precio_final, su.precio_base, p.precio, 0) - pagado.monto) > 0.01
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
END $function$;