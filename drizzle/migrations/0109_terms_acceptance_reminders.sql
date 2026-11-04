CREATE TABLE public.reservation_terms_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('participante_d5','admin_d10')),
  recipient text,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','enviado','error','suprimido','omitido')),
  attempts int NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (reservation_id, kind)
);
GRANT SELECT ON public.reservation_terms_reminders TO authenticated;
GRANT ALL ON public.reservation_terms_reminders TO service_role;
ALTER TABLE public.reservation_terms_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins ven recordatorios de condiciones" ON public.reservation_terms_reminders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Solo reservas creadas desde la activación: sin envíos retroactivos.
INSERT INTO public.app_config(key, value, description)
VALUES ('terms_reminders_config', jsonb_build_object('since', now(), 'enabled', true),
  'Recordatorios de aceptación de condiciones (día 5 participante, día 10 administración). Solo reservas creadas desde "since".')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.terms_reminder_candidates()
RETURNS TABLE(reservation_id uuid, kind text, recipient text, nombre text, apellido text, event_id uuid, event_title text,
  package_nombre text, created_at timestamptz, amount_paid numeric, balance_due numeric, moneda text, days_since int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH cfg AS (
    SELECT (value->>'since')::timestamptz since, COALESCE((value->>'enabled')::boolean, false) enabled
    FROM public.app_config WHERE key='terms_reminders_config'
  ), base AS (
    SELECT r.*, ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
              - (r.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS d,
           COALESCE(a.email, r.external_email) em, COALESCE(a.nombre, r.external_first_name) nom,
           COALESCE(a.apellido, r.external_last_name) ape, e.title
    FROM public.event_reservations r CROSS JOIN cfg
    JOIN public.events e ON e.id = r.event_id
    LEFT JOIN public.alumnos a ON a.id = r.alumno_id
    WHERE cfg.enabled AND r.created_at >= cfg.since
      AND r.terminos_pendientes IS TRUE AND r.terminos_aceptados_at IS NULL
      AND r.reservation_status <> 'cancelada' AND r.cancelled_at IS NULL
  )
  SELECT b.id, k.kind, CASE WHEN k.kind='participante_d5' THEN lower(trim(b.em)) END, b.nom, b.ape, b.event_id, b.title,
    b.package_nombre_snapshot, b.created_at, b.amount_paid, b.balance_due, COALESCE(b.currency_snapshot, b.moneda), b.d::int
  FROM base b CROSS JOIN (VALUES ('participante_d5',5),('admin_d10',10)) k(kind, day)
  WHERE b.d >= k.day
    AND NOT EXISTS (SELECT 1 FROM public.reservation_terms_reminders t
                    WHERE t.reservation_id=b.id AND t.kind=k.kind AND t.status <> 'error')
    AND (k.kind='admin_d10' OR (b.em IS NOT NULL AND b.em LIKE '%@%'));
$$;

-- Reclama atómicamente un envío (o reintenta uno en error). Revalida elegibilidad.
-- Para el participante devuelve un token vigente (reutiliza o renueva), nunca se registra.
CREATE OR REPLACE FUNCTION public.terms_reminder_claim(p_reservation_id uuid, p_kind text, p_recipient text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; rid uuid; tok text;
BEGIN
  SELECT * INTO r FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR r.terminos_pendientes IS NOT TRUE OR r.terminos_aceptados_at IS NOT NULL
     OR r.reservation_status = 'cancelada' OR r.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'no_elegible');
  END IF;
  INSERT INTO public.reservation_terms_reminders(reservation_id, kind, recipient)
  VALUES (p_reservation_id, p_kind, p_recipient)
  ON CONFLICT (reservation_id, kind) DO UPDATE SET status='pendiente', attempts = reservation_terms_reminders.attempts + 1, recipient = EXCLUDED.recipient
    WHERE reservation_terms_reminders.status = 'error' AND reservation_terms_reminders.attempts < 3
  RETURNING id INTO rid;
  IF rid IS NULL THEN RETURN jsonb_build_object('claimed', false, 'reason', 'ya_procesado'); END IF;
  IF p_kind = 'participante_d5' THEN
    tok := r.terminos_token;
    IF tok IS NULL OR r.terminos_token_expires_at IS NULL OR r.terminos_token_expires_at < now() + interval '7 days' THEN
      tok := encode(extensions.gen_random_bytes(24), 'hex');
      PERFORM set_config('app.terms_internal', 'on', true);
      UPDATE public.event_reservations SET terminos_token = tok, terminos_token_expires_at = now() + interval '30 days' WHERE id = p_reservation_id;
      PERFORM set_config('app.terms_internal', 'off', true);
    END IF;
  END IF;
  RETURN jsonb_build_object('claimed', true, 'id', rid, 'token', tok);
END $$;

CREATE OR REPLACE FUNCTION public.terms_reminder_finish(p_id uuid, p_status text, p_error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.reservation_terms_reminders
  SET status = p_status, last_error = left(p_error, 500), sent_at = CASE WHEN p_status='enviado' THEN now() ELSE sent_at END
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.terms_reminder_candidates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.terms_reminder_claim(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.terms_reminder_finish(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terms_reminder_candidates() TO service_role;
GRANT EXECUTE ON FUNCTION public.terms_reminder_claim(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.terms_reminder_finish(uuid, text, text) TO service_role;