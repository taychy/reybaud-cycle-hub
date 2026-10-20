CREATE TABLE public.rescheduling_guest_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reservation_id uuid NOT NULL REFERENCES public.event_reservations(id),
 session_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rescheduling_guest_sessions TO service_role;
ALTER TABLE public.rescheduling_guest_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rescheduling_identity_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL,
 reservation_id uuid,
 success boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rescheduling_identity_attempts_res_idx ON public.rescheduling_identity_attempts(reservation_id, created_at);
CREATE INDEX rescheduling_identity_attempts_ev_idx ON public.rescheduling_identity_attempts(event_id, created_at);
GRANT SELECT ON public.rescheduling_identity_attempts TO authenticated;
GRANT ALL ON public.rescheduling_identity_attempts TO service_role;
ALTER TABLE public.rescheduling_identity_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_attempts_admin ON public.rescheduling_identity_attempts FOR SELECT TO authenticated USING (public._rescheduling_admin());

CREATE TABLE public.rescheduling_communications (
 reservation_id uuid NOT NULL REFERENCES public.event_reservations(id),
 channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
 event_id uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('preparado','enviado','fallido')),
 note text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,
 actor_id uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (reservation_id, channel)
);
GRANT SELECT ON public.rescheduling_communications TO authenticated;
GRANT ALL ON public.rescheduling_communications TO service_role;
ALTER TABLE public.rescheduling_communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY rescheduling_comms_admin ON public.rescheduling_communications FOR SELECT TO authenticated USING (public._rescheduling_admin());

CREATE TABLE public.rescheduling_communication_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 command_id uuid NOT NULL UNIQUE,
 reservation_id uuid NOT NULL,
 channel text NOT NULL,
 status text NOT NULL,
 note text NOT NULL,
 actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rescheduling_communication_log TO authenticated;
GRANT ALL ON public.rescheduling_communication_log TO service_role;
ALTER TABLE public.rescheduling_communication_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY rescheduling_comm_log_admin ON public.rescheduling_communication_log FOR SELECT TO authenticated USING (public._rescheduling_admin());

CREATE FUNCTION public._rs_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT regexp_replace(lower(translate(trim(coalesce(t,'')),'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ''´`','AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun')),'[^a-z ]','','g') $$;
CREATE FUNCTION public._rs_name_ok(stored text, given text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT length(public._rs_norm(given))>=2 AND (regexp_replace(public._rs_norm(stored),'\s+',' ','g')=regexp_replace(public._rs_norm(given),'\s+',' ','g')
  OR split_part(regexp_replace(public._rs_norm(stored),'\s+',' ','g'),' ',1)=regexp_replace(public._rs_norm(given),'\s+',' ','g')) $$;
REVOKE ALL ON FUNCTION public._rs_norm(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rs_name_ok(text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public._rescheduling_guest_ok(p_reservation_id uuid, p_session text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_session IS NOT NULL AND p_session ~ '^rsg_[a-f0-9]{64}$' AND EXISTS (SELECT 1 FROM public.rescheduling_guest_sessions WHERE reservation_id=p_reservation_id AND session_hash=encode(extensions.digest(p_session,'sha256'),'hex') AND expires_at>now()) $$;
REVOKE ALL ON FUNCTION public._rescheduling_guest_ok(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.verify_rescheduling_identity(p_event_id uuid, p_reservation_id uuid, p_token text, p_dni text, p_first text, p_last text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_rescheduling_campaigns%ROWTYPE; r event_reservations%ROWTYPE; doc text; fn text; ln text; ok boolean:=false; raw text; exp timestamptz;
BEGIN
 SELECT * INTO c FROM event_rescheduling_campaigns WHERE event_id=p_event_id;
 IF c.event_id IS NULL OR NOT c.public_enabled THEN RETURN jsonb_build_object('ok',false,'reason','unavailable'); END IF;
 IF (SELECT count(*) FROM rescheduling_identity_attempts WHERE event_id=p_event_id AND NOT success AND created_at>now()-interval '15 minutes')>=200
  OR (p_reservation_id IS NOT NULL AND (SELECT count(*) FROM rescheduling_identity_attempts WHERE reservation_id=p_reservation_id AND NOT success AND created_at>now()-interval '15 minutes')>=5) THEN
  RETURN jsonb_build_object('ok',false,'reason','rate_limited');
 END IF;
 SELECT * INTO r FROM event_reservations WHERE id=p_reservation_id AND event_id=p_event_id AND reservation_status NOT IN ('cancelada','rechazada','cancelled','cancelado');
 IF r.id IS NOT NULL AND p_token IS NOT NULL AND length(p_token)>=20 AND length(p_token)<=200 AND r.access_token=p_token AND length(coalesce(p_dni,''))<=20 AND length(coalesce(p_first,''))<=100 AND length(coalesce(p_last,''))<=100 THEN
  SELECT coalesce(nullif(a.documento,''),nullif(ep.documento,'')), coalesce(nullif(a.nombre,''),nullif(ep.nombre,''),r.external_first_name), coalesce(nullif(a.apellido,''),nullif(ep.apellido,''),r.external_last_name)
   INTO doc,fn,ln FROM (SELECT 1) x LEFT JOIN alumnos a ON a.id=r.alumno_id LEFT JOIN event_external_participants ep ON ep.id=r.external_participant_id;
  ok := length(regexp_replace(coalesce(doc,''),'\D','','g'))>=6 AND regexp_replace(doc,'\D','','g')=regexp_replace(coalesce(p_dni,''),'\D','','g') AND public._rs_name_ok(fn,p_first) AND public._rs_name_ok(ln,p_last);
 END IF;
 INSERT INTO rescheduling_identity_attempts(event_id,reservation_id,success) VALUES(p_event_id,CASE WHEN r.id IS NULL THEN NULL ELSE r.id END,ok);
 IF NOT ok THEN RETURN jsonb_build_object('ok',false,'reason','not_verified'); END IF;
 raw := 'rsg_'||encode(extensions.gen_random_bytes(32),'hex'); exp := now()+interval '2 hours';
 INSERT INTO rescheduling_guest_sessions(reservation_id,session_hash,expires_at) VALUES(r.id,encode(extensions.digest(raw,'sha256'),'hex'),exp);
 RETURN jsonb_build_object('ok',true,'session',raw,'expires_at',exp);
END $$;
REVOKE ALL ON FUNCTION public.verify_rescheduling_identity(uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_rescheduling_identity(uuid,uuid,text,text,text,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_rescheduling_context(p_event_id uuid, p_reservation_id uuid DEFAULT NULL::uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE c record;r record;arr jsonb:='[]';isadmin boolean:=public._rescheduling_admin();owned boolean; BEGIN
SELECT * INTO c FROM event_rescheduling_campaigns WHERE event_id=p_event_id;
IF NOT FOUND OR (NOT c.public_enabled AND NOT isadmin) THEN RETURN jsonb_build_object('available',false); END IF;
IF NOT isadmin AND p_token IS NULL AND auth.uid() IS NULL THEN RETURN jsonb_build_object('available',true,'auth_required',true); END IF;
FOR r IN SELECT er.*,coalesce(nullif(concat_ws(' ',a.nombre,a.apellido),''),nullif(concat_ws(' ',ep.nombre,ep.apellido),''),concat_ws(' ',er.external_first_name,er.external_last_name)) AS participant FROM event_reservations er LEFT JOIN alumnos a ON a.id=er.alumno_id LEFT JOIN event_external_participants ep ON ep.id=er.external_participant_id WHERE er.event_id=p_event_id AND er.reservation_status NOT IN ('cancelada','rechazada','cancelled','cancelado') AND (p_reservation_id IS NULL OR er.id=p_reservation_id) LOOP
owned:=isadmin OR (p_token IS NOT NULL AND p_reservation_id IS NOT NULL AND public._rescheduling_guest_ok(r.id,p_token)) OR (p_token IS NULL AND auth.uid() IS NOT NULL AND (EXISTS(SELECT 1 FROM alumnos a WHERE a.id=r.alumno_id AND (a.user_id=auth.uid() OR (public._rescheduling_verified_email() AND lower(a.email)=lower(auth.email())))) OR (public._rescheduling_verified_email() AND (lower(nullif(r.external_email,''))=lower(auth.email()) OR EXISTS(SELECT 1 FROM event_external_participants ep WHERE ep.id=r.external_participant_id AND lower(ep.email)=lower(auth.email()))))));
IF owned THEN arr:=arr || jsonb_build_array(jsonb_build_object('reservation_id',r.id,'participant',r.participant,'package',r.package_nombre_snapshot,'financial',public._rescheduling_financial(r.id),'size',public._rescheduling_size(r.id),'request',(SELECT to_jsonb(q)-'snapshot'-'actor_id'-'reviewed_by'-'command_id' FROM reservation_rescheduling_requests q WHERE q.reservation_id=r.id))); END IF; END LOOP;
IF NOT isadmin AND p_token IS NOT NULL AND jsonb_array_length(arr)=0 THEN RETURN jsonb_build_object('available',true,'verification_required',true); END IF;
RETURN jsonb_build_object('available',true,'admin',isadmin,'campaign',to_jsonb(c),'reservations',arr); END $function$;

CREATE FUNCTION public.admin_rescheduling_comm_list(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 RETURN (WITH base AS (
  SELECT er.id, er.access_token,
   coalesce(nullif(a.nombre,''),nullif(ep.nombre,''),er.external_first_name) AS first_name,
   coalesce(nullif(concat_ws(' ',a.nombre,a.apellido),''),nullif(concat_ws(' ',ep.nombre,ep.apellido),''),concat_ws(' ',er.external_first_name,er.external_last_name)) AS participant,
   lower(trim(coalesce(nullif(a.email,''),nullif(ep.email,''),nullif(er.external_email,'')))) AS email,
   regexp_replace(coalesce(nullif(a.telefono,''),nullif(ep.telefono,''),''),'\D','','g') AS phone,
   er.package_nombre_snapshot AS package
  FROM event_reservations er LEFT JOIN alumnos a ON a.id=er.alumno_id LEFT JOIN event_external_participants ep ON ep.id=er.external_participant_id
  WHERE er.event_id=p_event_id AND er.reservation_status='reserva_confirmada')
 SELECT coalesce(jsonb_agg(jsonb_build_object('reservation_id',b.id,'participant',b.participant,'first_name',b.first_name,'package',b.package,'email',b.email,'phone',b.phone,'token',b.access_token,
   'email_valid',b.email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' AND b.email NOT LIKE '%.invalid',
   'phone_valid',length(b.phone) BETWEEN 10 AND 15,
   'email_duplicate',(SELECT count(*) FROM base x WHERE x.email=b.email)>1,
   'phone_duplicate',b.phone<>'' AND (SELECT count(*) FROM base x WHERE x.phone=b.phone)>1,
   'suppressed',EXISTS(SELECT 1 FROM suppressed_emails s WHERE lower(s.email)=b.email),
   'completed',EXISTS(SELECT 1 FROM reservation_rescheduling_requests q WHERE q.reservation_id=b.id),
   'email_status',(SELECT jsonb_build_object('status',m.status,'version',m.version,'updated_at',m.updated_at) FROM rescheduling_communications m WHERE m.reservation_id=b.id AND m.channel='email'),
   'whatsapp_status',(SELECT jsonb_build_object('status',m.status,'version',m.version,'updated_at',m.updated_at) FROM rescheduling_communications m WHERE m.reservation_id=b.id AND m.channel='whatsapp')
  ) ORDER BY b.participant),'[]') FROM base b);
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_comm_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_comm_list(uuid) TO authenticated, service_role;

CREATE FUNCTION public.admin_rescheduling_comm_mark(p_reservation_id uuid, p_channel text, p_status text, p_note text, p_expected_version integer, p_command_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r event_reservations%ROWTYPE; m rescheduling_communications%ROWTYPE;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF p_channel NOT IN ('email','whatsapp') OR p_status NOT IN ('preparado','enviado','fallido') OR p_command_id IS NULL OR p_expected_version IS NULL OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
 IF p_status IN ('enviado','fallido') AND length(trim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'Indicá cómo se confirmó el envío'; END IF;
 IF EXISTS (SELECT 1 FROM rescheduling_communication_log WHERE command_id=p_command_id) THEN
  IF EXISTS (SELECT 1 FROM rescheduling_communication_log WHERE command_id=p_command_id AND reservation_id=p_reservation_id AND channel=p_channel AND status=p_status) THEN RETURN (SELECT to_jsonb(x) FROM rescheduling_communications x WHERE reservation_id=p_reservation_id AND channel=p_channel); END IF;
  RAISE EXCEPTION 'Identificador ya utilizado';
 END IF;
 SELECT * INTO r FROM event_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF r.id IS NULL OR r.reservation_status<>'reserva_confirmada' OR NOT EXISTS (SELECT 1 FROM event_rescheduling_campaigns WHERE event_id=r.event_id) THEN RAISE EXCEPTION 'Reserva no disponible'; END IF;
 SELECT * INTO m FROM rescheduling_communications WHERE reservation_id=p_reservation_id AND channel=p_channel FOR UPDATE;
 IF coalesce(m.version,0)<>p_expected_version THEN RAISE EXCEPTION 'El estado cambió. Recargá'; END IF;
 IF m.status='enviado' AND p_status='enviado' THEN RAISE EXCEPTION 'Ya figura enviado; no se registra un duplicado'; END IF;
 INSERT INTO rescheduling_communications(reservation_id,channel,event_id,status,note,actor_id) VALUES(p_reservation_id,p_channel,r.event_id,p_status,coalesce(p_note,''),auth.uid())
 ON CONFLICT (reservation_id,channel) DO UPDATE SET status=excluded.status,note=excluded.note,actor_id=excluded.actor_id,version=rescheduling_communications.version+1,updated_at=now() RETURNING * INTO m;
 INSERT INTO rescheduling_communication_log(command_id,reservation_id,channel,status,note,actor_id) VALUES(p_command_id,p_reservation_id,p_channel,p_status,coalesce(p_note,''),auth.uid());
 RETURN to_jsonb(m);
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_comm_mark(uuid,text,text,text,integer,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_comm_mark(uuid,text,text,text,integer,uuid) TO authenticated, service_role;