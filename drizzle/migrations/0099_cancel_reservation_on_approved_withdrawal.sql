CREATE OR REPLACE FUNCTION public.admin_rescheduling_seat_action(p_reservation_id uuid, p_action text, p_reason text, p_expected_version integer, p_command_id uuid, p_replacement_reservation_id uuid DEFAULT NULL::uuid, p_window text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r event_reservations%ROWTYPE; rep event_reservations%ROWTYPE; q reservation_rescheduling_requests%ROWTYPE; s rescheduling_seat_releases%ROWTYPE; old jsonb; c event_rescheduling_campaigns%ROWTYPE; opt jsonb; prior rescheduling_seat_history%ROWTYPE;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF p_command_id IS NULL OR p_expected_version IS NULL OR p_action NOT IN ('confirm_renunciation','approve_release','offer','occupy','revoke') OR length(trim(coalesce(p_reason,'')))<5 OR length(p_reason)>2000 THEN RAISE EXCEPTION 'Acción, versión y motivo obligatorios'; END IF;
 SELECT * INTO r FROM event_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Reserva inexistente'; END IF;
 SELECT * INTO c FROM event_rescheduling_campaigns WHERE event_id=r.event_id;
 IF c.event_id IS NULL THEN RAISE EXCEPTION 'Sin campaña de reprogramación'; END IF;
 SELECT * INTO prior FROM rescheduling_seat_history WHERE command_id=p_command_id;
 IF prior.id IS NOT NULL THEN
  IF prior.action<>p_action OR NOT EXISTS (SELECT 1 FROM rescheduling_seat_releases WHERE id=prior.release_id AND source_reservation_id=p_reservation_id) THEN RAISE EXCEPTION 'Identificador ya utilizado para otra operación'; END IF;
  RETURN prior.after_data;
 END IF;
 SELECT * INTO q FROM reservation_rescheduling_requests WHERE reservation_id=p_reservation_id FOR UPDATE;
 SELECT * INTO s FROM rescheduling_seat_releases WHERE source_reservation_id=p_reservation_id FOR UPDATE;
 IF coalesce(s.version,0)<>p_expected_version THEN RAISE EXCEPTION 'El cupo cambió. Recargá antes de continuar'; END IF;
 old := CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END;
 IF p_action='confirm_renunciation' THEN
  IF s.id IS NOT NULL AND s.state<>'anulada' THEN RAISE EXCEPTION 'La renuncia ya está registrada'; END IF;
  IF r.reservation_status<>'reserva_confirmada' THEN RAISE EXCEPTION 'Solo reservas vigentes de la campaña'; END IF;
  IF q.reservation_id IS NULL OR q.review_status<>'validada' OR q.choice NOT IN ('refund','credit') THEN RAISE EXCEPTION 'Requiere solicitud de devolución o crédito validada'; END IF;
  IF q.choice='credit' AND length(trim(p_reason))<20 THEN RAISE EXCEPTION 'Crédito: documentá la revisión independiente del desistimiento'; END IF;
  IF s.id IS NULL THEN
   INSERT INTO rescheduling_seat_releases(event_id,source_reservation_id,package_id,kind,state,request_revision,reason,confirmed_by,confirmed_at)
   VALUES(r.event_id,r.id,r.package_id,CASE WHEN q.choice='refund' THEN 'refund' ELSE 'credit_withdrawal' END,'renuncia_confirmada',q.revision,p_reason,auth.uid(),now()) RETURNING * INTO s;
  ELSE
   UPDATE rescheduling_seat_releases SET kind=CASE WHEN q.choice='refund' THEN 'refund' ELSE 'credit_withdrawal' END,state='renuncia_confirmada',request_revision=q.revision,reason=p_reason,confirmed_by=auth.uid(),confirmed_at=now(),approved_by=NULL,approved_at=NULL,offered_by=NULL,offered_at=NULL,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
  END IF;
 ELSIF p_action='approve_release' THEN
  IF s.state IS DISTINCT FROM 'renuncia_confirmada' THEN RAISE EXCEPTION 'Primero confirmá la renuncia'; END IF;
  IF q.revision<>s.request_revision OR q.choice NOT IN ('refund','credit') OR q.review_status<>'validada' THEN RAISE EXCEPTION 'La solicitud cambió después de confirmar la renuncia; revisá de nuevo'; END IF;
  IF r.reservation_status<>'reserva_confirmada' THEN RAISE EXCEPTION 'La reserva fuente ya no está vigente; revisión manual'; END IF;
  UPDATE rescheduling_seat_releases SET state='liberada',approved_by=auth.uid(),approved_at=now(),version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
  -- Baja aprobada: la reserva fuente queda cancelada y sin habitación, sin tocar pagos, créditos ni devoluciones.
  DELETE FROM event_room_assignments WHERE reservation_id=r.id;
  UPDATE event_reservations SET reservation_status='cancelada', estado='cancelada', cancelled_at=coalesce(cancelled_at,now()),
    cancellation_reason=coalesce(nullif(cancellation_reason,''),'Baja por reprogramación aprobada ('||CASE WHEN q.choice='refund' THEN 'devolución' ELSE 'crédito' END||')'), updated_at=now()
   WHERE id=r.id;
  INSERT INTO reservation_status_history(reservation_id,old_reservation_status,new_reservation_status,old_payment_status,new_payment_status,changed_by,changed_by_role,note)
   VALUES(r.id,r.reservation_status,'cancelada',r.payment_status,r.payment_status,auth.uid(),'admin','Baja por reprogramación aprobada (liberación de plaza '||s.id||')');
 ELSIF p_action='offer' THEN
  IF s.state IS DISTINCT FROM 'liberada' THEN RAISE EXCEPTION 'Solo cupos liberados por administración'; END IF;
  IF NOT c.resale_enabled THEN RAISE EXCEPTION 'Reventa no habilitada para esta campaña'; END IF;
  UPDATE rescheduling_seat_releases SET state='ofrecida',offered_by=auth.uid(),offered_at=now(),version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 ELSIF p_action='occupy' THEN
  IF s.state IS DISTINCT FROM 'ofrecida' THEN RAISE EXCEPTION 'Solo cupos ofrecidos pueden ocuparse'; END IF;
  IF NOT c.resale_enabled THEN RAISE EXCEPTION 'Reventa no habilitada para esta campaña'; END IF;
  SELECT o INTO opt FROM jsonb_array_elements(c.options) o WHERE o->>'value'=p_window AND o ? 'start' AND o ? 'end';
  IF opt IS NULL THEN RAISE EXCEPTION 'Ventana de noches inválida'; END IF;
  SELECT * INTO rep FROM event_reservations WHERE id=p_replacement_reservation_id FOR UPDATE;
  IF rep.id IS NULL OR rep.id=r.id OR rep.event_id<>r.event_id OR rep.reservation_status<>'reserva_confirmada' OR rep.package_id IS DISTINCT FROM s.package_id THEN RAISE EXCEPTION 'El reemplazo debe ser una reserva vigente del mismo evento y paquete'; END IF;
  IF rep.created_at<=s.approved_at THEN RAISE EXCEPTION 'El reemplazo debe ser posterior a la liberación aprobada'; END IF;
  IF EXISTS (SELECT 1 FROM rescheduling_seat_releases WHERE source_reservation_id=rep.id AND state<>'anulada') THEN RAISE EXCEPTION 'El reemplazo no puede ser una plaza liberada'; END IF;
  INSERT INTO rescheduling_seat_occupancies(release_id,replacement_reservation_id,window_choice,nights,created_by)
  VALUES(s.id,rep.id,p_window,daterange((opt->>'start')::date,(opt->>'end')::date,'[)'),auth.uid());
  UPDATE rescheduling_seat_releases SET state='ocupada',version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 ELSE
  IF s.state IS NULL OR s.state NOT IN ('renuncia_confirmada','liberada','ofrecida') THEN RAISE EXCEPTION 'Solo se anulan cupos no ocupados'; END IF;
  IF r.reservation_status='cancelada' THEN RAISE EXCEPTION 'La reserva ya fue cancelada por la baja aprobada; reactivarla requiere revisión manual'; END IF;
  UPDATE rescheduling_seat_releases SET state='anulada',revoked_by=auth.uid(),revoked_at=now(),revoke_reason=p_reason,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 END IF;
 INSERT INTO rescheduling_seat_history(release_id,command_id,action,actor_id,reason,before_data,after_data) VALUES(s.id,p_command_id,p_action,auth.uid(),p_reason,old,to_jsonb(s));
 RETURN to_jsonb(s);
END $function$;