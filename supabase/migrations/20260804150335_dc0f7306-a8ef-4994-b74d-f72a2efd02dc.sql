CREATE OR REPLACE FUNCTION public.get_alumno_payment_targets(_alumno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservations jsonb;
  v_subs jsonb;
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

  RETURN jsonb_build_object('reservations', v_reservations, 'subscriptions', v_subs);
END;
$$;