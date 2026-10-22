CREATE OR REPLACE FUNCTION public.crosssell_book(p_event_id uuid, p_token text, p_package_id uuid, p_terms_version text, p_room_choice text DEFAULT NULL::text, p_companion_name text DEFAULT NULL::text, p_metodo_pago text DEFAULT 'transferencia'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid; src event_reservations%ROWTYPE; ppr int; mate text; snap jsonb; newid uuid:=gen_random_uuid(); ex uuid; mail text; st text; acomp text; pref boolean; mate_has boolean:=false; wl_n int; wl_id uuid; act uuid;
BEGIN
 rid:=_crosssell_source(p_event_id,p_token);
 IF rid IS NULL THEN RAISE EXCEPTION 'Enlace inválido, vencido o sin reserva activa en el viaje de origen'; END IF;
 SELECT * INTO src FROM event_reservations WHERE id=rid;
 SELECT personas_por_habitacion INTO ppr FROM event_packages WHERE id=src.package_id;
 SELECT lower(trim(coalesce(nullif(src.external_email,''),(SELECT email FROM alumnos WHERE id=src.alumno_id),(SELECT email FROM event_external_participants WHERE id=src.external_participant_id)))) INTO mail;
 PERFORM pg_advisory_xact_lock(hashtext('crosssell:'||p_event_id||':'||coalesce(src.alumno_id::text,mail)));
 SELECT m.id INTO ex FROM event_reservations m LEFT JOIN alumnos b ON b.id=m.alumno_id WHERE m.event_id=p_event_id AND m.cancelled_at IS NULL AND m.reservation_status NOT IN ('cancelada','rechazada')
  AND ((src.alumno_id IS NOT NULL AND m.alumno_id=src.alumno_id) OR lower(trim(coalesce(nullif(m.external_email,''),b.email)))=mail) LIMIT 1;
 IF ex IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'already',true,'reservation_id',ex); END IF;
 IF NOT EXISTS(SELECT 1 FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'reservation_request'->'packages') o WHERE e.id=p_event_id AND o->>'id'=p_package_id::text AND o->>'requires_alps'='true') THEN RAISE EXCEPTION 'Elegí una de las tarifas especiales'; END IF;
 IF p_metodo_pago NOT IN ('transferencia','efectivo') THEN RAISE EXCEPTION 'Medio de pago no disponible'; END IF;
 snap:=event_terms_snapshot(p_event_id);
 IF snap IS NULL OR p_terms_version IS DISTINCT FROM snap->>'version' THEN RAISE EXCEPTION 'Las condiciones se actualizaron. Recargá la página para leer la versión vigente.'; END IF;
 SELECT rr.nombre INTO mate FROM reservation_roommates rr WHERE rr.reservation_id=rid AND nullif(trim(rr.nombre),'') IS NOT NULL ORDER BY rr.posicion NULLS LAST LIMIT 1;
 mate:=coalesce(mate,nullif(trim(src.rooming_acompanante_nombre),''));
 IF coalesce(ppr,2)>=2 AND mate IS NOT NULL AND coalesce(p_room_choice,'mismo_companero')='mismo_companero' THEN
  acomp:=mate; pref:=false;
  SELECT EXISTS(SELECT 1 FROM reservation_roommates rr JOIN event_reservations m ON m.event_id=p_event_id AND m.cancelled_at IS NULL AND m.reservation_status NOT IN ('cancelada','rechazada') LEFT JOIN alumnos b ON b.id=m.alumno_id
   WHERE rr.reservation_id=rid AND ((rr.alumno_id IS NOT NULL AND rr.alumno_id=m.alumno_id) OR lower(trim(rr.email))=lower(trim(coalesce(nullif(m.external_email,''),b.email))))) INTO mate_has;
  st:=CASE WHEN mate_has THEN 'completa' ELSE 'acompanante_propuesto' END;
 ELSIF p_room_choice='companero' THEN
  IF length(trim(coalesce(p_companion_name,'')))<3 OR length(p_companion_name)>120 THEN RAISE EXCEPTION 'Indicá con quién querés compartir la habitación'; END IF;
  acomp:=trim(p_companion_name); pref:=false; st:='acompanante_propuesto';
 ELSIF p_room_choice='asignacion' OR (p_room_choice='mismo_companero' AND mate IS NULL) THEN
  acomp:=NULL; pref:=true; st:='pendiente_asignacion';
 ELSE RAISE EXCEPTION 'Elegí cómo querés compartir la habitación doble'; END IF;
 snap:=snap||jsonb_build_object('aceptado_at',now(),'canal',CASE WHEN nullif(trim(coalesce(p_token,'')),'') IS NULL THEN 'reserva_rapida_sesion' ELSE 'reserva_rapida_enlace' END,'aceptado_por_user_id',auth.uid(),'origen_reserva_id',rid);
 PERFORM set_config('app.crosssell_source',rid::text,true);
 PERFORM set_config('app.terms_internal','on',true);
 INSERT INTO event_reservations(id,event_id,package_id,alumno_id,external_participant_id,external_email,external_first_name,external_last_name,created_by,metodo_pago,
   accepted_terms,terminos_aceptados_at,terminos_version_aceptada,terminos_snapshot,terminos_pendientes,
   rooming_acompanante_nombre,prefiere_asignacion,rooming_asignacion_estado,rooming_asignacion_updated_at,genero_habitacion,tipo_vinculo)
 VALUES(newid,p_event_id,p_package_id,src.alumno_id,src.external_participant_id,mail,src.external_first_name,src.external_last_name,'cliente',p_metodo_pago,
   true,now(),snap->>'version',snap,false,acomp,pref,st,now(),src.genero_habitacion,CASE WHEN acomp IS NOT NULL AND acomp=mate THEN src.tipo_vinculo END);
 PERFORM set_config('app.terms_internal','off',true);
 PERFORM set_config('app.crosssell_source','',true);
 UPDATE event_crosssell_links SET used_reservation_id=newid, used_at=now() WHERE event_id=p_event_id AND source_reservation_id=rid AND revoked_at IS NULL AND used_reservation_id IS NULL;
 -- Vincular la solicitud previa de esta misma persona (identidad verificada por sesión o enlace); nunca ajenas.
 SELECT count(*),min(w.id::text)::uuid INTO wl_n,wl_id FROM event_waitlist_entries w
  WHERE w.event_id=p_event_id AND w.origen='solicitud_reserva_sin_pago' AND w.converted_reservation_id IS NULL AND w.estado IN ('nuevo','contactado')
   AND ((src.alumno_id IS NOT NULL AND w.alumno_id=src.alumno_id) OR lower(trim(w.email))=mail);
 act:=coalesce(auth.uid(),(SELECT l.created_by FROM event_crosssell_links l WHERE l.event_id=p_event_id AND l.source_reservation_id=rid ORDER BY l.created_at DESC LIMIT 1));
 IF wl_n=1 THEN
  PERFORM set_config('app.booking_conversion','on',true);
  UPDATE event_waitlist_entries SET converted_reservation_id=newid,converted_at=now(),converted_by=auth.uid(),estado='convertido' WHERE id=wl_id;
  PERFORM set_config('app.booking_conversion','off',true);
  IF act IS NOT NULL THEN
   INSERT INTO event_booking_opening_log(event_id,actor,action,detail) VALUES(p_event_id,act,'crosssell_request_linked',jsonb_build_object('request_id',wl_id,'reservation_id',newid,'via',CASE WHEN auth.uid() IS NULL THEN 'enlace_titular' ELSE 'sesion_titular' END));
  END IF;
 ELSIF wl_n>1 AND act IS NOT NULL THEN
  INSERT INTO event_booking_opening_log(event_id,actor,action,detail) VALUES(p_event_id,act,'crosssell_request_ambiguous',jsonb_build_object('reservation_id',newid,'matches',wl_n,'note','Varias solicitudes coinciden: revisar a mano; no se vinculó ninguna.'));
 END IF;
 INSERT INTO reservation_status_history(reservation_id,old_reservation_status,new_reservation_status,old_payment_status,new_payment_status,changed_by,changed_by_role,note)
  SELECT newid,NULL,reservation_status,NULL,payment_status,auth.uid(),CASE WHEN auth.uid() IS NULL THEN 'participante_enlace' ELSE 'alumno' END,'Reserva rápida desde reserva activa del viaje vinculado (condiciones '||(snap->>'version')||')'||CASE WHEN wl_n=1 THEN ' · solicitud previa vinculada' WHEN wl_n>1 THEN ' · ATENCIÓN: varias solicitudes coinciden, revisar' ELSE '' END FROM event_reservations WHERE id=newid;
 RETURN jsonb_build_object('ok',true,'already',false,'reservation_id',newid,'rooming',st,'request_linked',coalesce(wl_n,0)=1,'request_ambiguous',coalesce(wl_n,0)>1);
END $function$;