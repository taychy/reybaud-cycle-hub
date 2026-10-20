CREATE OR REPLACE FUNCTION public._rescheduling_email_claim(p_event_id uuid, p_reservation_ids uuid[], p_actor uuid) RETURNS TABLE(reservation_id uuid, email text, first_name text, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE a rescheduling_email_authorizations%ROWTYPE; e record;
BEGIN
 IF cardinality(p_reservation_ids) IS NULL OR cardinality(p_reservation_ids)>10 THEN RAISE EXCEPTION 'Lote inválido (máximo 10)'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('resched_email_'||p_event_id));
 IF NOT coalesce((SELECT c.public_enabled FROM event_rescheduling_campaigns c WHERE c.event_id=p_event_id),false) THEN RAISE EXCEPTION 'Encuesta cerrada: envío bloqueado'; END IF;
 SELECT * INTO a FROM rescheduling_email_authorizations z WHERE z.event_id=p_event_id AND z.revoked_at IS NULL ORDER BY z.created_at DESC LIMIT 1;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Sin autorización vigente de audiencia'; END IF;
 FOR e IN SELECT x.reservation_id AS rid, x.email AS em, x.first_name AS fn, x.token AS tk FROM public._rescheduling_email_eligible(p_event_id) x
   LEFT JOIN rescheduling_communications m ON m.reservation_id=x.reservation_id AND m.channel='email'
   WHERE x.reservation_id = ANY(p_reservation_ids) AND x.reservation_id = ANY(a.audience)
     AND (m.status IS NULL OR m.status IN ('preparado','fallido') OR (m.status='enviando' AND m.updated_at < now()-interval '15 minutes'))
 LOOP
  INSERT INTO rescheduling_communications AS rc (reservation_id,channel,event_id,status,note,actor_id) VALUES(e.rid,'email',p_event_id,'enviando','Envío del sistema en curso',p_actor)
  ON CONFLICT (reservation_id,channel) DO UPDATE SET status='enviando',note=excluded.note,actor_id=excluded.actor_id,version=rc.version+1,updated_at=now();
  INSERT INTO rescheduling_communication_log(command_id,reservation_id,channel,status,note,actor_id) VALUES(gen_random_uuid(),e.rid,'email','enviando','Autorización '||a.id,p_actor);
  reservation_id:=e.rid; email:=e.em; first_name:=e.fn; token:=e.tk; RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._rescheduling_email_claim(uuid,uuid[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._rescheduling_email_claim(uuid,uuid[],uuid) TO service_role;