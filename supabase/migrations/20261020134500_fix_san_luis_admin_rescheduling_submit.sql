-- San Luis: permitir registrar por administración decisiones recibidas por WhatsApp.
-- Solo usuarios admin/super_admin con fuente y nota obligatorias, sin token invitado.
-- La encuesta individual conserva la verificación de titular o invitado; este cambio no modifica reservas ni pagos.
-- Corregido directamente en producción y comprobado con pruebas de permisos sin escrituras.

CREATE OR REPLACE FUNCTION public.submit_rescheduling_request(p_event_id uuid, p_reservation_id uuid, p_input jsonb, p_expected_revision integer, p_command_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c record;r record;oldrow reservation_rescheduling_requests%ROWTYPE;newrow reservation_rescheduling_requests%ROWTYPE;ctx jsonb;financial jsonb;sz jsonb;opt jsonb;isadmin boolean:=false;ch text:=p_input->>'choice';j boolean;jc boolean;js text;dl text;src text;nt text; BEGIN
IF p_command_id IS NULL OR p_expected_revision IS NULL OR jsonb_typeof(p_input)<>'object' OR length(p_input::text)>8000 THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
isadmin:=coalesce(public._rescheduling_admin(),false) AND p_token IS NULL AND nullif(btrim(p_input->>'source'),'') IS NOT NULL AND nullif(btrim(p_input->>'note'),'') IS NOT NULL;
SELECT * INTO c FROM event_rescheduling_campaigns WHERE event_id=p_event_id FOR SHARE;
IF NOT FOUND OR (NOT c.public_enabled AND NOT isadmin) THEN RAISE EXCEPTION 'Reprogramación aún no habilitada'; END IF;
SELECT * INTO r FROM event_reservations WHERE id=p_reservation_id AND event_id=p_event_id FOR UPDATE;
IF NOT FOUND OR r.reservation_status IN ('cancelada','rechazada','cancelled','cancelado') THEN RAISE EXCEPTION 'Reserva no disponible'; END IF;
IF NOT isadmin THEN
 ctx:=public.get_rescheduling_context(p_event_id,p_reservation_id,p_token);
 IF jsonb_array_length(coalesce(ctx->'reservations','[]'))<>1 THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
END IF;
SELECT * INTO oldrow FROM reservation_rescheduling_requests WHERE reservation_id=p_reservation_id;
IF EXISTS(SELECT 1 FROM reservation_rescheduling_history WHERE command_id=p_command_id) THEN IF EXISTS(SELECT 1 FROM reservation_rescheduling_history WHERE command_id=p_command_id AND reservation_id=p_reservation_id) THEN RETURN to_jsonb(oldrow)-'snapshot'-'actor_id'-'reviewed_by'-'command_id'; END IF; RAISE EXCEPTION 'Identificador ya utilizado'; END IF;
IF coalesce(oldrow.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'Otra respuesta fue guardada. Recargá antes de continuar'; END IF;
SELECT o INTO opt FROM jsonb_array_elements(c.options) o WHERE o->>'value'=ch;
IF opt IS NULL OR coalesce((p_input->>'consent')::boolean,false)=false THEN RAISE EXCEPTION 'Elegí una opción y confirmá el consentimiento'; END IF;
src:=CASE WHEN isadmin THEN nullif(trim(p_input->>'source'),'') ELSE CASE WHEN p_token IS NULL THEN 'Sesión verificada' ELSE 'Enlace personal' END END;nt:=coalesce(p_input->>'note','');
IF isadmin AND (src IS NULL OR length(src)>120 OR length(trim(nt))=0) THEN RAISE EXCEPTION 'Fuente y nota administrativa obligatorias'; END IF; IF length(nt)>2000 THEN RAISE EXCEPTION 'Nota demasiado extensa'; END IF;
financial:=public._rescheduling_financial(p_reservation_id);sz:=public._rescheduling_size(p_reservation_id);
IF ch IN ('refund','credit') THEN j:=(p_input->>'jersey_requested')::boolean; IF j THEN jc:=coalesce((p_input->>'jersey_consent')::boolean,false);js:=p_input->>'jersey_size';dl:=p_input->>'delivery'; IF NOT jc OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sz->'options') o WHERE o->>'value'=js) OR dl IS NULL OR dl NOT IN ('retiro','envio') THEN RAISE EXCEPTION 'Confirmá talle, entrega y consentimiento del jersey'; END IF; IF NOT (financial->>'requires_reconciliation')::boolean AND (financial->>'estimated_remaining')::numeric<c.jersey_price THEN RAISE EXCEPTION 'Saldo insuficiente para solicitar deducción del jersey'; END IF; END IF; END IF;
INSERT INTO reservation_rescheduling_requests(reservation_id,event_id,choice,jersey_requested,jersey_size,delivery,jersey_consent,consent_at,consent_text,policy_version,origin,source,note,actor_id,revision,command_id,snapshot) VALUES(p_reservation_id,p_event_id,ch,j,js,dl,coalesce(jc,false),now(),c.consent_text,c.policy_version,CASE WHEN isadmin THEN 'admin' WHEN p_token IS NULL THEN 'owner_session' ELSE 'personal_token' END,src,nt,auth.uid(),coalesce(oldrow.revision,0)+1,p_command_id,jsonb_build_object('financial',financial,'size',sz,'option',opt,'policy',c.policy_text,'jersey_price',c.jersey_price,'historical_date',(SELECT date FROM events WHERE id=p_event_id),'historical_end_date',(SELECT end_date FROM events WHERE id=p_event_id),'package_id',r.package_id,'reservation_status',r.reservation_status,'terms_version',r.terminos_version_aceptada)) ON CONFLICT(reservation_id) DO UPDATE SET choice=excluded.choice,jersey_requested=excluded.jersey_requested,jersey_size=excluded.jersey_size,delivery=excluded.delivery,jersey_consent=excluded.jersey_consent,consent_at=excluded.consent_at,consent_text=excluded.consent_text,policy_version=excluded.policy_version,origin=excluded.origin,source=excluded.source,note=excluded.note,actor_id=excluded.actor_id,revision=excluded.revision,command_id=excluded.command_id,snapshot=excluded.snapshot,review_status='pendiente',admin_note='',reviewed_by=NULL,reviewed_at=NULL,updated_at=now() RETURNING * INTO newrow;
INSERT INTO reservation_rescheduling_history(reservation_id,revision,command_id,actor_id,origin,before_data,after_data) VALUES(p_reservation_id,newrow.revision,p_command_id,auth.uid(),newrow.origin,CASE WHEN oldrow.reservation_id IS NULL THEN NULL ELSE to_jsonb(oldrow) END,to_jsonb(newrow));
RETURN to_jsonb(newrow)-'snapshot'-'actor_id'-'reviewed_by'-'command_id'; END $function$

