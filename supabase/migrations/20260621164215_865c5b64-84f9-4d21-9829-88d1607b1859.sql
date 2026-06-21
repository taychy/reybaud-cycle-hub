
-- =========================================================
-- 1. Helper: is_super_admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- =========================================================
-- 2. event_reservations: email tracking columns
-- =========================================================
ALTER TABLE public.event_reservations
  ADD COLUMN IF NOT EXISTS confirmation_payment_email_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_payment_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_payment_email_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_payment_email_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_payment_email_last_error text;

-- =========================================================
-- 3. reservation_payment_intents
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  concepto text NOT NULL,
  installment_number int,
  amount numeric NOT NULL,
  currency text NOT NULL,
  preference_id text,
  init_point text,
  status text NOT NULL DEFAULT 'pendiente',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 min'),
  resolved_at timestamptz,
  created_by uuid,
  actor_type text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_intent_status CHECK (status IN ('pendiente','aprobada','expirada','cancelada','fallida'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_intent
  ON public.reservation_payment_intents (reservation_id, concepto, amount)
  WHERE status = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_intents_reservation ON public.reservation_payment_intents(reservation_id);
CREATE INDEX IF NOT EXISTS idx_intents_status_expires ON public.reservation_payment_intents(status, expires_at);

GRANT SELECT ON public.reservation_payment_intents TO authenticated;
GRANT ALL ON public.reservation_payment_intents TO service_role;

ALTER TABLE public.reservation_payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all intents"
  ON public.reservation_payment_intents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

CREATE POLICY "Service role full intents"
  ON public.reservation_payment_intents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 4. reservation_cash_announcements
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_cash_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.event_reservations(id) ON DELETE CASCADE,
  alumno_id uuid,
  external_participant_id uuid,
  amount numeric NOT NULL,
  currency text NOT NULL,
  concepto text NOT NULL,
  installment_number int,
  nota_libre text,
  lugar_previsto text,
  fecha_limite date,
  status text NOT NULL DEFAULT 'anunciado',
  payment_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_motivo text,
  created_by uuid,
  actor_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cash_status CHECK (status IN ('anunciado','cobrado','rechazado','vuelto_a_pendiente'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_cash_announce
  ON public.reservation_cash_announcements (reservation_id, concepto)
  WHERE status = 'anunciado';

CREATE INDEX IF NOT EXISTS idx_cash_reservation ON public.reservation_cash_announcements(reservation_id);
CREATE INDEX IF NOT EXISTS idx_cash_status ON public.reservation_cash_announcements(status);

GRANT SELECT ON public.reservation_cash_announcements TO authenticated;
GRANT ALL ON public.reservation_cash_announcements TO service_role;

ALTER TABLE public.reservation_cash_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all cash announcements"
  ON public.reservation_cash_announcements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

CREATE POLICY "Alumnos view own cash announcements"
  ON public.reservation_cash_announcements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alumnos a
      WHERE a.id = reservation_cash_announcements.alumno_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full cash announcements"
  ON public.reservation_cash_announcements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 5. admin_notification_events
-- =========================================================
CREATE TABLE IF NOT EXISTS public.admin_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  prioridad text NOT NULL DEFAULT 'general',
  reservation_id uuid REFERENCES public.event_reservations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  destinatarios text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'pendiente',
  intentos int NOT NULL DEFAULT 0,
  last_error text,
  deduplication_key text UNIQUE,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_notif_status CHECK (status IN ('pendiente','enviado','fallido','silenciado')),
  CONSTRAINT chk_notif_prioridad CHECK (prioridad IN ('pago','efectivo','checklist_critico','checklist_general','general'))
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_status ON public.admin_notification_events(status, prioridad);
CREATE INDEX IF NOT EXISTS idx_admin_notif_reservation ON public.admin_notification_events(reservation_id);

GRANT SELECT ON public.admin_notification_events TO authenticated;
GRANT ALL ON public.admin_notification_events TO service_role;

ALTER TABLE public.admin_notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view notification events"
  ON public.admin_notification_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

CREATE POLICY "Service role full notif"
  ON public.admin_notification_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================
-- 6. admin_profiles.notification_prefs
-- =========================================================
ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT
    '{"pagos":true,"efectivo_anunciado":true,"checklist_critico":true,"checklist_general":false}'::jsonb;

-- =========================================================
-- 7. importe_a_pagar_ahora
-- =========================================================
CREATE OR REPLACE FUNCTION public.importe_a_pagar_ahora(_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  inst record;
  monto numeric;
  balance numeric;
  concepto_out text;
  inst_num int;
BEGIN
  SELECT id, balance_due, amount_total, currency_snapshot, moneda
  INTO r FROM public.event_reservations WHERE id = _reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  balance := COALESCE(r.balance_due, r.amount_total, 0);
  IF balance <= 0 THEN
    RETURN jsonb_build_object('amount', 0, 'currency', COALESCE(r.currency_snapshot, r.moneda, 'ARS'),
                              'concepto', 'sin_saldo', 'installment_number', NULL);
  END IF;

  -- Próxima cuota con saldo (sort_order, luego due_date, luego installment_number)
  SELECT installment_number, label, COALESCE(balance_due, amount - COALESCE(paid_amount,0)) AS pend
  INTO inst
  FROM public.reservation_installments
  WHERE reservation_id = _reservation_id
    AND COALESCE(balance_due, amount - COALESCE(paid_amount,0)) > 0
    AND COALESCE(status, '') NOT IN ('pagada','condonada','anulada')
  ORDER BY COALESCE(sort_order, installment_number) ASC, due_date ASC NULLS LAST, installment_number ASC
  LIMIT 1;

  IF FOUND THEN
    monto := LEAST(inst.pend, balance);
    inst_num := inst.installment_number;
    concepto_out := CASE WHEN inst.installment_number = 1 THEN 'seña' ELSE 'cuota_' || inst.installment_number END;
  ELSE
    monto := balance;
    inst_num := NULL;
    concepto_out := 'saldo';
  END IF;

  RETURN jsonb_build_object(
    'amount', monto,
    'currency', COALESCE(r.currency_snapshot, r.moneda, 'ARS'),
    'concepto', concepto_out,
    'installment_number', inst_num,
    'balance_total', balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.importe_a_pagar_ahora(uuid) TO authenticated, service_role;

-- =========================================================
-- 8. confirm_reservation (atómico: status + email queued + notif admin)
-- =========================================================
CREATE OR REPLACE FUNCTION public.confirm_reservation(_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  is_admin boolean;
  notif_id uuid;
  dedup text;
BEGIN
  is_admin := public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid());
  IF NOT is_admin THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id, reservation_status, confirmation_payment_email_queued_at, alumno_id, external_participant_id
  INTO r
  FROM public.event_reservations
  WHERE id = _reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF r.reservation_status = 'reserva_confirmada' THEN
    RETURN jsonb_build_object('ok', true, 'already_confirmed', true,
                              'email_queued', r.confirmation_payment_email_queued_at IS NOT NULL);
  END IF;

  UPDATE public.event_reservations
  SET reservation_status = 'reserva_confirmada',
      confirmed_at = COALESCE(confirmed_at, now()),
      confirmation_payment_email_queued_at = COALESCE(confirmation_payment_email_queued_at, now()),
      updated_at = now()
  WHERE id = _reservation_id;

  dedup := 'confirm:' || _reservation_id::text;

  INSERT INTO public.admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
  VALUES ('reserva_confirmada', 'general', _reservation_id,
          jsonb_build_object('alumno_id', r.alumno_id, 'external_participant_id', r.external_participant_id),
          dedup)
  ON CONFLICT (deduplication_key) DO NOTHING
  RETURNING id INTO notif_id;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), 'admin',
          'reserva.confirmada', 'event_reservation', _reservation_id::text,
          jsonb_build_object('email_queued', true, 'notif_id', notif_id));

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), 'admin',
          'reserva.confirmation_email.encolado', 'event_reservation', _reservation_id::text,
          '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'already_confirmed', false, 'email_queued', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_reservation(uuid) TO authenticated, service_role;

-- =========================================================
-- 9. announce_cash_payment (calcula monto en server, upsert por concepto)
-- =========================================================
CREATE OR REPLACE FUNCTION public.announce_cash_payment(
  _reservation_id uuid,
  _nota text,
  _lugar text,
  _fecha_limite date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calc jsonb;
  r record;
  existing record;
  new_id uuid;
  is_owner boolean;
  is_admin boolean;
  actor text;
BEGIN
  SELECT id, alumno_id, external_participant_id, payment_status
  INTO r FROM public.event_reservations WHERE id = _reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid());
  is_owner := EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = r.alumno_id AND a.user_id = auth.uid());

  IF NOT (is_admin OR is_owner) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  actor := CASE WHEN is_admin THEN 'admin' WHEN is_owner THEN 'alumno' ELSE 'desconocido' END;

  calc := public.importe_a_pagar_ahora(_reservation_id);
  IF (calc->>'amount')::numeric <= 0 THEN
    RAISE EXCEPTION 'No hay saldo pendiente';
  END IF;

  SELECT * INTO existing
  FROM public.reservation_cash_announcements
  WHERE reservation_id = _reservation_id
    AND concepto = (calc->>'concepto')
    AND status = 'anunciado'
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.reservation_cash_announcements
    SET nota_libre = COALESCE(_nota, nota_libre),
        lugar_previsto = COALESCE(_lugar, lugar_previsto),
        fecha_limite = COALESCE(_fecha_limite, fecha_limite),
        updated_at = now()
    WHERE id = existing.id;
    new_id := existing.id;
  ELSE
    INSERT INTO public.reservation_cash_announcements
      (reservation_id, alumno_id, external_participant_id, amount, currency, concepto,
       installment_number, nota_libre, lugar_previsto, fecha_limite, created_by, actor_type)
    VALUES (_reservation_id, r.alumno_id, r.external_participant_id,
            (calc->>'amount')::numeric, calc->>'currency', calc->>'concepto',
            NULLIF(calc->>'installment_number','')::int,
            _nota, _lugar, _fecha_limite, auth.uid(), actor)
    RETURNING id INTO new_id;

    UPDATE public.event_reservations
    SET payment_status = CASE
          WHEN payment_status IN ('pago_validado','parcial') THEN payment_status
          ELSE 'efectivo_anunciado' END,
        updated_at = now()
    WHERE id = _reservation_id;

    INSERT INTO public.admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
    VALUES ('efectivo_anunciado', 'efectivo', _reservation_id,
            jsonb_build_object('announcement_id', new_id, 'amount', calc->>'amount',
                               'currency', calc->>'currency', 'concepto', calc->>'concepto'),
            'cash_announce:' || new_id::text)
    ON CONFLICT (deduplication_key) DO NOTHING;
  END IF;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), actor,
          CASE WHEN existing.id IS NULL THEN 'reserva.efectivo.anunciado' ELSE 'reserva.efectivo.editado' END,
          'reservation_cash_announcement', new_id::text,
          jsonb_build_object('reservation_id', _reservation_id, 'concepto', calc->>'concepto',
                             'amount', calc->>'amount', 'lugar', _lugar));

  RETURN jsonb_build_object('ok', true, 'announcement_id', new_id, 'amount', calc->>'amount',
                            'currency', calc->>'currency', 'concepto', calc->>'concepto',
                            'reused', existing.id IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.announce_cash_payment(uuid, text, text, date) TO authenticated, service_role;

-- =========================================================
-- 10. mark_cash_collected (atómico: pago real + cierra anuncio)
-- =========================================================
CREATE OR REPLACE FUNCTION public.mark_cash_collected(
  _announcement_id uuid,
  _payment_date date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  is_admin boolean;
  new_payment_id uuid;
BEGIN
  is_admin := public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid());
  IF NOT is_admin THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT * INTO a FROM public.reservation_cash_announcements
  WHERE id = _announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anuncio no encontrado'; END IF;
  IF a.status <> 'anunciado' THEN RAISE EXCEPTION 'Anuncio ya resuelto (%)' , a.status; END IF;

  INSERT INTO public.reservation_payments
    (reservation_id, alumno_id, amount, currency, payment_date, payment_method,
     status, notes, reviewed_at, reviewed_by, installment_number)
  VALUES (a.reservation_id, a.alumno_id, a.amount, a.currency,
          COALESCE(_payment_date, CURRENT_DATE), 'efectivo',
          'aprobado', COALESCE(_notes, a.nota_libre), now(), auth.uid(),
          a.installment_number)
  RETURNING id INTO new_payment_id;

  UPDATE public.reservation_cash_announcements
  SET status = 'cobrado',
      payment_id = new_payment_id,
      resolved_at = now(),
      resolved_by = auth.uid(),
      updated_at = now()
  WHERE id = _announcement_id;

  INSERT INTO public.admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
  VALUES ('efectivo_cobrado', 'pago', a.reservation_id,
          jsonb_build_object('announcement_id', _announcement_id, 'payment_id', new_payment_id),
          'cash_collected:' || _announcement_id::text)
  ON CONFLICT (deduplication_key) DO NOTHING;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), 'admin',
          'reserva.efectivo.cobrado', 'reservation_cash_announcement', _announcement_id::text,
          jsonb_build_object('payment_id', new_payment_id, 'amount', a.amount));

  RETURN jsonb_build_object('ok', true, 'payment_id', new_payment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_cash_collected(uuid, date, text) TO authenticated, service_role;

-- =========================================================
-- 11. reject_cash_announcement / revert_cash_announcement
-- =========================================================
CREATE OR REPLACE FUNCTION public.resolve_cash_announcement(
  _announcement_id uuid,
  _new_status text,
  _motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  is_admin boolean;
  action_name text;
BEGIN
  is_admin := public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid());
  IF NOT is_admin THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _new_status NOT IN ('rechazado','vuelto_a_pendiente') THEN
    RAISE EXCEPTION 'Estado invalido';
  END IF;

  SELECT * INTO a FROM public.reservation_cash_announcements
  WHERE id = _announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anuncio no encontrado'; END IF;
  IF a.status <> 'anunciado' THEN RAISE EXCEPTION 'Anuncio ya resuelto'; END IF;

  UPDATE public.reservation_cash_announcements
  SET status = _new_status, resolved_at = now(), resolved_by = auth.uid(),
      resolved_motivo = _motivo, updated_at = now()
  WHERE id = _announcement_id;

  action_name := CASE WHEN _new_status = 'rechazado' THEN 'reserva.efectivo.rechazado'
                      ELSE 'reserva.efectivo.vuelto_a_pendiente' END;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()), 'admin',
          action_name, 'reservation_cash_announcement', _announcement_id::text,
          jsonb_build_object('motivo', _motivo));

  RETURN jsonb_build_object('ok', true, 'status', _new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_cash_announcement(uuid, text, text) TO authenticated, service_role;

-- =========================================================
-- 12. get_my_reservation (valida ownership)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_my_reservation(_reservation_id uuid, _external_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  is_owner boolean := false;
  is_external boolean := false;
  is_admin boolean;
BEGIN
  SELECT * INTO r FROM public.event_reservations WHERE id = _reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;

  is_admin := public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid());
  is_owner := EXISTS (SELECT 1 FROM public.alumnos a WHERE a.id = r.alumno_id AND a.user_id = auth.uid());

  IF r.external_participant_id IS NOT NULL AND _external_token IS NOT NULL THEN
    is_external := EXISTS (
      SELECT 1 FROM public.event_external_participants ep
      WHERE ep.id = r.external_participant_id
        AND ep.public_access_token = _external_token
        AND (ep.token_expires_at IS NULL OR ep.token_expires_at > now())
    );
  END IF;

  IF NOT (is_admin OR is_owner OR is_external) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN to_jsonb(r);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_reservation(uuid, text) TO authenticated, anon, service_role;

-- =========================================================
-- 13. app_config: admin_notification_emails — seed + helper enmascarado
-- =========================================================
INSERT INTO public.app_config (key, value, description)
VALUES ('admin_notification_emails', '[]'::jsonb,
        'Lista de emails que reciben notificaciones automáticas de reservas (super_admin gestiona).')
ON CONFLICT (key) DO NOTHING;

-- Policy: solo super_admin puede leer/escribir el valor real desde la tabla.
-- Admins comunes usan la RPC enmascarada.
DROP POLICY IF EXISTS "Super admin manage notif emails" ON public.app_config;
CREATE POLICY "Super admin manage notif emails"
  ON public.app_config FOR ALL TO authenticated
  USING (
    CASE WHEN key = 'admin_notification_emails'
         THEN public.is_super_admin(auth.uid())
         ELSE true END
  )
  WITH CHECK (
    CASE WHEN key = 'admin_notification_emails'
         THEN public.is_super_admin(auth.uid())
         ELSE true END
  );

CREATE OR REPLACE FUNCTION public.get_admin_notification_emails_masked()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  is_admin boolean;
  is_super boolean;
  arr text[];
  masked text[];
  e text;
BEGIN
  is_admin := public.has_role(auth.uid(), 'admin');
  is_super := public.is_super_admin(auth.uid());
  IF NOT (is_admin OR is_super) THEN RAISE EXCEPTION 'No autorizado'; END IF;

  SELECT value INTO v FROM public.app_config WHERE key = 'admin_notification_emails';
  IF v IS NULL THEN v := '[]'::jsonb; END IF;

  IF is_super THEN
    RETURN jsonb_build_object('count', jsonb_array_length(v), 'emails', v, 'masked', false);
  END IF;

  SELECT array_agg(x) INTO arr FROM jsonb_array_elements_text(v) x;
  IF arr IS NULL THEN arr := ARRAY[]::text[]; END IF;
  masked := ARRAY[]::text[];
  FOREACH e IN ARRAY arr LOOP
    masked := masked || (
      CASE WHEN position('@' IN e) > 1
           THEN left(e,1) || '***@' || split_part(e,'@',2)
           ELSE '***' END
    );
  END LOOP;

  RETURN jsonb_build_object('count', array_length(arr,1), 'emails', to_jsonb(masked), 'masked', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_notification_emails_masked() TO authenticated;

-- =========================================================
-- 14. update_updated_at triggers on new tables
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_intents_touch ON public.reservation_payment_intents;
CREATE TRIGGER trg_intents_touch BEFORE UPDATE ON public.reservation_payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_cash_touch ON public.reservation_cash_announcements;
CREATE TRIGGER trg_cash_touch BEFORE UPDATE ON public.reservation_cash_announcements
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_notif_touch ON public.admin_notification_events;
CREATE TRIGGER trg_notif_touch BEFORE UPDATE ON public.admin_notification_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
