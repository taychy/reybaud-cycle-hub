ALTER TABLE public.rescheduling_communications DROP CONSTRAINT IF EXISTS rescheduling_communications_status_check;
ALTER TABLE public.rescheduling_communications ADD CONSTRAINT rescheduling_communications_status_check CHECK (status IN ('preparado','enviando','enviado','fallido'));

CREATE TABLE public.rescheduling_email_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 audience uuid[] NOT NULL,
 template_version text NOT NULL,
 checks jsonb NOT NULL,
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_by uuid
);
GRANT SELECT ON public.rescheduling_email_authorizations TO authenticated;
GRANT ALL ON public.rescheduling_email_authorizations TO service_role;
ALTER TABLE public.rescheduling_email_authorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY rescheduling_email_auth_admin ON public.rescheduling_email_authorizations FOR SELECT TO authenticated USING (public._rescheduling_admin());

CREATE TABLE public.rescheduling_email_test_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 recipient text NOT NULL,
 result text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rescheduling_email_test_log TO authenticated;
GRANT ALL ON public.rescheduling_email_test_log TO service_role;
ALTER TABLE public.rescheduling_email_test_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY rescheduling_email_test_admin ON public.rescheduling_email_test_log FOR SELECT TO authenticated USING (public._rescheduling_admin());

-- Elegibles para el email operativo: reserva vigente, email válido, no suprimido, no repetido, sin respuesta, no enviado.
CREATE FUNCTION public._rescheduling_email_eligible(p_event_id uuid)
RETURNS TABLE(reservation_id uuid, email text, first_name text, token text, comm_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH base AS (
  SELECT er.id, er.access_token,
   coalesce(nullif(a.nombre,''),nullif(ep.nombre,''),er.external_first_name) AS first_name,
   lower(trim(coalesce(nullif(a.email,''),nullif(ep.email,''),nullif(er.external_email,'')))) AS email
  FROM event_reservations er LEFT JOIN alumnos a ON a.id=er.alumno_id LEFT JOIN event_external_participants ep ON ep.id=er.external_participant_id
  WHERE er.event_id=p_event_id AND er.reservation_status='reserva_confirmada')
 SELECT b.id, b.email, b.first_name, b.access_token, m.status
 FROM base b LEFT JOIN rescheduling_communications m ON m.reservation_id=b.id AND m.channel='email'
 WHERE b.email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' AND b.email NOT LIKE '%.invalid'
  AND b.access_token IS NOT NULL
  AND (SELECT count(*) FROM base x WHERE x.email=b.email)=1
  AND NOT EXISTS (SELECT 1 FROM suppressed_emails s WHERE lower(s.email)=b.email)
  AND NOT EXISTS (SELECT 1 FROM reservation_rescheduling_requests q WHERE q.reservation_id=b.id)
  AND coalesce(m.status,'') <> 'enviado'
$$;
REVOKE ALL ON FUNCTION public._rescheduling_email_eligible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._rescheduling_email_eligible(uuid) TO service_role;

-- Estado de compuertas visible para admin (sin tokens).
CREATE FUNCTION public.admin_rescheduling_email_gate_status(p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a rescheduling_email_authorizations%ROWTYPE; pub boolean;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 SELECT public_enabled INTO pub FROM event_rescheduling_campaigns WHERE event_id=p_event_id;
 SELECT * INTO a FROM rescheduling_email_authorizations WHERE event_id=p_event_id AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object(
  'public_enabled', coalesce(pub,false),
  'eligible', (SELECT count(*) FROM public._rescheduling_email_eligible(p_event_id)),
  'tests', (SELECT count(*) FROM rescheduling_email_test_log WHERE event_id=p_event_id AND result='aceptado'),
  'authorization', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id,'audience_count',cardinality(a.audience),'template_version',a.template_version,'checks',a.checks,'created_at',a.created_at) END);
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_email_gate_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_email_gate_status(uuid) TO authenticated, service_role;

-- Autorización expresa de audiencia: exige encuesta habilitada, prueba aceptada y todas las confirmaciones.
CREATE FUNCTION public.admin_rescheduling_email_authorize(p_event_id uuid, p_audience_count integer, p_template_version text, p_checks jsonb, p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aud uuid[]; k text; rid uuid;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('resched_email_'||p_event_id));
 IF NOT coalesce((SELECT public_enabled FROM event_rescheduling_campaigns WHERE event_id=p_event_id),false) THEN RAISE EXCEPTION 'La encuesta todavía no está habilitada'; END IF;
 FOREACH k IN ARRAY ARRAY['app_publicada','ruta_produccion_probada','enlaces_probados','plantilla_revisada','audiencia_confirmada'] LOOP
  IF coalesce((p_checks->>k)::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Falta confirmar: %', k; END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM rescheduling_email_test_log WHERE event_id=p_event_id AND result='aceptado') THEN RAISE EXCEPTION 'Primero enviá una prueba'; END IF;
 IF length(trim(coalesce(p_note,'')))<10 OR coalesce(p_template_version,'')='' THEN RAISE EXCEPTION 'Indicá motivo y versión de plantilla'; END IF;
 SELECT array_agg(reservation_id ORDER BY reservation_id) INTO aud FROM public._rescheduling_email_eligible(p_event_id);
 IF coalesce(cardinality(aud),0)=0 OR cardinality(aud)<>p_audience_count THEN RAISE EXCEPTION 'La audiencia cambió (ahora %). Recargá y revisá', coalesce(cardinality(aud),0); END IF;
 UPDATE rescheduling_email_authorizations SET revoked_at=now(), revoked_by=auth.uid() WHERE event_id=p_event_id AND revoked_at IS NULL;
 INSERT INTO rescheduling_email_authorizations(event_id,actor_id,audience,template_version,checks,note) VALUES(p_event_id,auth.uid(),aud,p_template_version,p_checks,trim(p_note)) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'audience_count',cardinality(aud));
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_email_authorize(uuid,integer,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_email_authorize(uuid,integer,text,jsonb,text) TO authenticated, service_role;

CREATE FUNCTION public.admin_rescheduling_email_revoke(p_event_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 UPDATE rescheduling_email_authorizations SET revoked_at=now(), revoked_by=auth.uid() WHERE event_id=p_event_id AND revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_email_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_email_revoke(uuid) TO authenticated, service_role;

-- Reclamo atómico por lote (solo servidor). Nunca reclama enviados ni completados; 'enviando' trabado >15 min se reintenta con la misma clave idempotente.
CREATE FUNCTION public._rescheduling_email_claim(p_event_id uuid, p_reservation_ids uuid[], p_actor uuid) RETURNS TABLE(reservation_id uuid, email text, first_name text, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a rescheduling_email_authorizations%ROWTYPE; e record;
BEGIN
 IF cardinality(p_reservation_ids) IS NULL OR cardinality(p_reservation_ids)>10 THEN RAISE EXCEPTION 'Lote inválido (máximo 10)'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('resched_email_'||p_event_id));
 IF NOT coalesce((SELECT public_enabled FROM event_rescheduling_campaigns WHERE event_id=p_event_id),false) THEN RAISE EXCEPTION 'Encuesta cerrada: envío bloqueado'; END IF;
 SELECT * INTO a FROM rescheduling_email_authorizations WHERE event_id=p_event_id AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Sin autorización vigente de audiencia'; END IF;
 FOR e IN SELECT x.* FROM public._rescheduling_email_eligible(p_event_id) x
   LEFT JOIN rescheduling_communications m ON m.reservation_id=x.reservation_id AND m.channel='email'
   WHERE x.reservation_id = ANY(p_reservation_ids) AND x.reservation_id = ANY(a.audience)
     AND (m.status IS NULL OR m.status IN ('preparado','fallido') OR (m.status='enviando' AND m.updated_at < now()-interval '15 minutes'))
 LOOP
  INSERT INTO rescheduling_communications(reservation_id,channel,event_id,status,note,actor_id) VALUES(e.reservation_id,'email',p_event_id,'enviando','Envío del sistema en curso',p_actor)
  ON CONFLICT (reservation_id,channel) DO UPDATE SET status='enviando',note=excluded.note,actor_id=excluded.actor_id,version=rescheduling_communications.version+1,updated_at=now();
  INSERT INTO rescheduling_communication_log(command_id,reservation_id,channel,status,note,actor_id) VALUES(gen_random_uuid(),e.reservation_id,'email','enviando','Autorización '||a.id,p_actor);
  reservation_id:=e.reservation_id; email:=e.email; first_name:=e.first_name; token:=e.token; RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._rescheduling_email_claim(uuid,uuid[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._rescheduling_email_claim(uuid,uuid[],uuid) TO service_role;

CREATE FUNCTION public._rescheduling_email_finish(p_reservation_id uuid, p_ok boolean, p_note text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE st text := CASE WHEN p_ok THEN 'enviado' ELSE 'fallido' END;
BEGIN
 UPDATE rescheduling_communications SET status=st, note=left(coalesce(p_note,''),1000), actor_id=p_actor, version=version+1, updated_at=now()
  WHERE reservation_id=p_reservation_id AND channel='email' AND status='enviando';
 IF FOUND THEN
  INSERT INTO rescheduling_communication_log(command_id,reservation_id,channel,status,note,actor_id) VALUES(gen_random_uuid(),p_reservation_id,'email',st,left(coalesce(p_note,''),1000),p_actor);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public._rescheduling_email_finish(uuid,boolean,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._rescheduling_email_finish(uuid,boolean,text,uuid) TO service_role;

-- Registro manual: el email solo puede figurar "enviado" mediante el envío del sistema; no se toca un envío en curso.
CREATE OR REPLACE FUNCTION public.admin_rescheduling_comm_mark(p_reservation_id uuid, p_channel text, p_status text, p_note text, p_expected_version integer, p_command_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r event_reservations%ROWTYPE; m rescheduling_communications%ROWTYPE;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF p_channel NOT IN ('email','whatsapp') OR p_status NOT IN ('preparado','enviado','fallido') OR p_command_id IS NULL OR p_expected_version IS NULL OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF p_channel='email' AND p_status<>'preparado' THEN RAISE EXCEPTION 'El estado del email lo registra solo el envío del sistema'; END IF;
 IF p_status IN ('enviado','fallido') AND length(trim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'Indicá cómo se confirmó el envío'; END IF;
 IF EXISTS (SELECT 1 FROM rescheduling_communication_log WHERE command_id=p_command_id) THEN
  IF EXISTS (SELECT 1 FROM rescheduling_communication_log WHERE command_id=p_command_id AND reservation_id=p_reservation_id AND channel=p_channel AND status=p_status) THEN RETURN (SELECT to_jsonb(x) FROM rescheduling_communications x WHERE reservation_id=p_reservation_id AND channel=p_channel); END IF;
  RAISE EXCEPTION 'Identificador ya utilizado';
 END IF;
 SELECT * INTO r FROM event_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF r.id IS NULL OR r.reservation_status<>'reserva_confirmada' OR NOT EXISTS (SELECT 1 FROM event_rescheduling_campaigns WHERE event_id=r.event_id) THEN RAISE EXCEPTION 'Reserva no disponible'; END IF;
 SELECT * INTO m FROM rescheduling_communications WHERE reservation_id=p_reservation_id AND channel=p_channel FOR UPDATE;
 IF coalesce(m.version,0)<>p_expected_version THEN RAISE EXCEPTION 'El estado cambió. Recargá'; END IF;
 IF m.status IN ('enviado','enviando') THEN RAISE EXCEPTION 'Ya figura enviado o en curso; no se modifica'; END IF;
 INSERT INTO rescheduling_communications(reservation_id,channel,event_id,status,note,actor_id) VALUES(p_reservation_id,p_channel,r.event_id,p_status,coalesce(p_note,''),auth.uid())
 ON CONFLICT (reservation_id,channel) DO UPDATE SET status=excluded.status,note=excluded.note,actor_id=excluded.actor_id,version=rescheduling_communications.version+1,updated_at=now() RETURNING * INTO m;
 INSERT INTO rescheduling_communication_log(command_id,reservation_id,channel,status,note,actor_id) VALUES(p_command_id,p_reservation_id,p_channel,p_status,coalesce(p_note,''),auth.uid());
 RETURN to_jsonb(m);
END $$;