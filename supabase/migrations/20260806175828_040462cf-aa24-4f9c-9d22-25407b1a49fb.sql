-- 1) Auto-vincular reservas de participantes externos a la ficha del alumno por email
CREATE OR REPLACE FUNCTION public.link_reservation_to_alumno_by_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_alumno uuid;
BEGIN
  IF NEW.alumno_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_email := lower(trim(COALESCE(
    NEW.external_email,
    (SELECT p.email FROM public.event_external_participants p WHERE p.id = NEW.external_participant_id)
  )));

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT a.id INTO v_alumno
  FROM public.alumnos a
  WHERE lower(a.email) = v_email
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(a.emails_adicionales, ARRAY[]::text[])) ea
       WHERE lower(trim(ea)) = v_email
     )
  ORDER BY a.created_at ASC
  LIMIT 1;

  IF v_alumno IS NOT NULL THEN
    NEW.alumno_id := v_alumno;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_reservation_to_alumno ON public.event_reservations;
CREATE TRIGGER trg_link_reservation_to_alumno
BEFORE INSERT OR UPDATE OF external_email, external_participant_id, alumno_id
ON public.event_reservations
FOR EACH ROW EXECUTE FUNCTION public.link_reservation_to_alumno_by_email();

-- 2) Backfill de reservas externas ya existentes
UPDATE public.event_reservations r
SET alumno_id = a.id
FROM public.event_external_participants p, public.alumnos a
WHERE r.alumno_id IS NULL
  AND p.id = r.external_participant_id
  AND (
    lower(a.email) = lower(trim(p.email))
    OR EXISTS (
      SELECT 1 FROM unnest(COALESCE(a.emails_adicionales, ARRAY[]::text[])) ea
      WHERE lower(trim(ea)) = lower(trim(p.email))
    )
  );

UPDATE public.event_reservations r
SET alumno_id = a.id
FROM public.alumnos a
WHERE r.alumno_id IS NULL
  AND r.external_email IS NOT NULL
  AND (
    lower(a.email) = lower(trim(r.external_email))
    OR EXISTS (
      SELECT 1 FROM unnest(COALESCE(a.emails_adicionales, ARRAY[]::text[])) ea
      WHERE lower(trim(ea)) = lower(trim(r.external_email))
    )
  );

-- 3) Corregir get_alumno_payment_targets (columna de fecha del evento)
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