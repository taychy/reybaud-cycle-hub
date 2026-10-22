CREATE OR REPLACE FUNCTION public.admin_continue_booking_request(p_entry_id uuid, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE w event_waitlist_entries%ROWTYPE; c event_booking_openings%ROWTYPE; s jsonb; blockers jsonb; pkg event_packages%ROWTYPE; plan event_package_payment_plans%ROWTYPE; aid uuid; xid uuid; m integer; rid uuid; n integer; ext jsonb; em text;
BEGIN
 IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT event_id INTO w.event_id FROM event_waitlist_entries WHERE id=p_entry_id;
 SELECT * INTO c FROM event_booking_openings WHERE event_id=w.event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento sin apertura controlada'; END IF;
 SELECT * INTO w FROM event_waitlist_entries WHERE id=p_entry_id FOR UPDATE;
 IF w.converted_reservation_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'duplicate',true,'reservation_id',w.converted_reservation_id,'blockers','[]'::jsonb); END IF;
 s:=event_booking_opening_status(w.event_id); blockers:=s->'blockers';
 IF NOT coalesce((s->>'enabled')::boolean,false) THEN blockers:=blockers||jsonb_build_array('Las reservas formales siguen cerradas.'); END IF;
 IF (s->>'available')::integer<1 THEN blockers:=blockers||jsonb_build_array('No hay plazas en el pool global.'); END IF;
 IF w.origen<>'solicitud_reserva_sin_pago' OR w.estado NOT IN ('nuevo','contactado') OR w.respuestas->>'contact_consent' IS DISTINCT FROM 'true' THEN blockers:=blockers||jsonb_build_array('Solicitud no elegible o sin autorización de contacto.'); END IF;
 em:=lower(trim(w.email));
 IF em IS NULL OR em='' THEN blockers:=blockers||jsonb_build_array('La solicitud no tiene correo.'); END IF;
 SELECT count(*),min(id::text)::uuid INTO n,aid FROM alumnos WHERE lower(trim(email))=em;
 IF n>1 THEN aid:=NULL; END IF;
 SELECT count(*),min(id::text)::uuid INTO m,xid FROM event_external_participants WHERE lower(trim(email))=em;
 IF n=0 AND m>1 THEN blockers:=blockers||jsonb_build_array('Identidad ambigua: hay varias fichas de participante externo con este correo.'); END IF;
 IF n>=1 OR m<>1 THEN xid:=NULL; END IF;
 IF n>1 THEN blockers:=blockers||jsonb_build_array('Identidad ambigua: revisar fichas antes de continuar.'); END IF;
 IF w.alumno_id IS NOT NULL AND (aid IS NULL OR aid<>w.alumno_id) THEN blockers:=blockers||jsonb_build_array('La ficha vinculada no coincide con el correo solicitado.'); END IF;
 SELECT * INTO pkg FROM event_packages WHERE id=(w.respuestas->>'package_id')::uuid AND event_id=w.event_id;
 IF NOT FOUND THEN blockers:=blockers||jsonb_build_array('Paquete no encontrado.'); ELSE
  IF pkg.precio IS DISTINCT FROM (w.respuestas->>'price_eur')::numeric THEN blockers:=blockers||jsonb_build_array('El precio cambió: acordar la modalidad antes de continuar.'); END IF;
  IF NOT _booking_alps_eligible(w.event_id,pkg.id,aid,w.email) THEN blockers:=blockers||jsonb_build_array('Tarifa Alpes pendiente de reserva confirmada y alquiler en ambos viajes cuando corresponde.'); END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id LEFT JOIN event_external_participants x ON x.id=r.external_participant_id WHERE r.event_id=w.event_id AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada') AND (r.alumno_id=aid OR r.external_participant_id=xid OR lower(trim(coalesce(r.external_email,a.email,x.email)))=lower(trim(w.email)))) THEN blockers:=blockers||jsonb_build_array('Ya existe una reserva activa para esta persona; no se creará otra.'); END IF;
 IF NOT p_confirm OR jsonb_array_length(blockers)>0 THEN RETURN jsonb_build_object('ok',false,'blocked',jsonb_array_length(blockers)>0,'blockers',blockers,'deposit',500,'installments',8,'identity',CASE WHEN aid IS NOT NULL THEN 'alumno' WHEN xid IS NOT NULL THEN 'externo' WHEN n=0 AND m=0 THEN 'nuevo_externo' ELSE 'ambigua' END); END IF;
 IF aid IS NULL AND xid IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext('ext_participant:'||em));
  SELECT min(id::text)::uuid INTO xid FROM event_external_participants WHERE lower(trim(email))=em;
  IF xid IS NULL THEN
   INSERT INTO event_external_participants(nombre,apellido,email,telefono,notas)
   VALUES(coalesce(nullif(split_part(trim(w.nombre),' ',1),''),em),nullif(substr(trim(w.nombre),length(split_part(trim(w.nombre),' ',1))+2),''),em,nullif(trim(coalesce(w.telefono,'')),''),'Creado al continuar solicitud de reserva '||w.id::text) RETURNING id INTO xid;
  END IF;
 END IF;
 IF aid IS NULL AND xid IS NULL THEN RAISE EXCEPTION 'No se pudo identificar a la persona de la solicitud'; END IF;
 SELECT * INTO plan FROM event_package_payment_plans WHERE package_id=pkg.id AND activo AND archived_at IS NULL AND price_stage_id IS NULL;
 INSERT INTO event_reservations(event_id,alumno_id,external_participant_id,external_email,external_first_name,external_last_name,package_id,reservation_status,payment_status,estado,metodo_pago,amount_total,amount_paid,balance_due,price_snapshot,currency_snapshot,moneda,monto,payment_plan_id,payment_plan_name_snapshot,payment_plan_snapshot,created_by)
 VALUES(w.event_id,aid,xid,lower(trim(w.email)),split_part(trim(w.nombre),' ',1),nullif(substr(trim(w.nombre),length(split_part(trim(w.nombre),' ',1))+2),''),pkg.id,'solicitud_enviada','no_informado','solicitud_enviada','pendiente',pkg.precio,0,pkg.precio,pkg.precio,'EUR','EUR',pkg.precio,plan.id,plan.nombre,build_payment_plan_snapshot(plan.id,pkg.precio,current_date),'admin') RETURNING id INTO rid;
 PERFORM set_config('app.booking_conversion','on',true);
 UPDATE event_waitlist_entries SET converted_reservation_id=rid,converted_at=now(),converted_by=auth.uid(),estado='convertido' WHERE id=w.id;
 PERFORM set_config('app.booking_conversion','off',true);
 INSERT INTO reservation_status_history(reservation_id,old_reservation_status,new_reservation_status,old_payment_status,new_payment_status,changed_by,changed_by_role,note) VALUES(rid,NULL,'solicitud_enviada',NULL,'no_informado',auth.uid(),'admin','Continuación de solicitud: condiciones pendientes; sin seña acreditada ni plaza confirmada.');
 INSERT INTO event_booking_opening_log(event_id,actor,action,detail) VALUES(w.event_id,auth.uid(),'continue_request',jsonb_build_object('request_id',w.id,'reservation_id',rid));
 RETURN jsonb_build_object('ok',true,'duplicate',false,'reservation_id',rid,'alumno_id',aid,'external_participant_id',xid,'status','solicitud_enviada');
END $function$;