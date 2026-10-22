CREATE OR REPLACE FUNCTION public.get_crosssell_context(p_event_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid; r record; dep text; mate text; mail text; existing record; pkgs jsonb; mate_has boolean:=false; s jsonb;
BEGIN
 rid:=_crosssell_source(p_event_id,p_token);
 IF rid IS NULL THEN RETURN jsonb_build_object('eligible',false); END IF;
 SELECT x.*, p.nombre pkg_nombre, p.personas_por_habitacion ppr,
  coalesce(nullif(trim(a.nombre),''),x.external_first_name) fn, coalesce(nullif(trim(a.apellido),''),x.external_last_name) ln,
  lower(trim(coalesce(nullif(x.external_email,''),a.email))) em
 INTO r FROM event_reservations x LEFT JOIN event_packages p ON p.id=x.package_id LEFT JOIN alumnos a ON a.id=x.alumno_id WHERE x.id=rid;
 SELECT rr.nombre INTO mate FROM reservation_roommates rr WHERE rr.reservation_id=rid AND nullif(trim(rr.nombre),'') IS NOT NULL ORDER BY rr.posicion NULLS LAST LIMIT 1;
 mate:=coalesce(mate,nullif(trim(r.rooming_acompanante_nombre),''));
 IF mate IS NOT NULL THEN
  SELECT EXISTS(SELECT 1 FROM reservation_roommates rr JOIN event_reservations m ON m.event_id=p_event_id AND m.cancelled_at IS NULL AND m.reservation_status NOT IN ('cancelada','rechazada')
   LEFT JOIN alumnos b ON b.id=m.alumno_id
   WHERE rr.reservation_id=rid AND ((rr.alumno_id IS NOT NULL AND rr.alumno_id=m.alumno_id) OR lower(trim(rr.email))=lower(trim(coalesce(nullif(m.external_email,''),b.email))))) INTO mate_has;
 END IF;
 SELECT m.id, m.reservation_status::text st, m.payment_status::text ps, coalesce(m.package_nombre_snapshot,(SELECT nombre FROM event_packages WHERE id=m.package_id)) pk,
  coalesce(m.price_snapshot,m.amount_total) pr, coalesce(m.amount_paid,0) pd, coalesce(m.currency_snapshot,m.moneda,'EUR') cu INTO existing FROM event_reservations m LEFT JOIN alumnos b ON b.id=m.alumno_id
  WHERE m.event_id=p_event_id AND m.cancelled_at IS NULL AND m.reservation_status NOT IN ('cancelada','rechazada')
   AND ((r.alumno_id IS NOT NULL AND m.alumno_id=r.alumno_id) OR lower(trim(coalesce(nullif(m.external_email,''),b.email)))=r.em) LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'precio',p.precio,'currency',p.currency,'bike',o->>'bike','combined_total',p.precio+coalesce(r.price_snapshot,r.amount_total,0)) ORDER BY p.precio DESC),'[]')
  INTO pkgs FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'reservation_request'->'packages') o JOIN event_packages p ON p.id=(o->>'id')::uuid
  WHERE e.id=p_event_id AND o->>'requires_alps'='true' AND p.activo;
 s:=event_booking_opening_status(p_event_id);
 SELECT e.metadata->'payment_links'->>'deposit_url' INTO dep FROM events e WHERE e.id=p_event_id;
 IF dep IS NULL OR dep !~ '^https://link\.clicpay\.it/[A-Za-z0-9=_-]+$' THEN dep:=NULL; END IF;
 mail:=CASE WHEN r.em ~ '@' THEN left(split_part(r.em,'@',1),2)||'•••@'||split_part(r.em,'@',2) END;
 RETURN jsonb_build_object('eligible',true,'via',CASE WHEN nullif(trim(coalesce(p_token,'')),'') IS NULL THEN 'sesion' ELSE 'enlace' END,
  'first_name',r.fn,'last_name',r.ln,'email_masked',mail,
  'source',jsonb_build_object('status',r.reservation_status,'package',r.pkg_nombre,'price',coalesce(r.price_snapshot,r.amount_total),'currency',coalesce(r.currency_snapshot,'EUR'),'room',CASE WHEN r.ppr=1 THEN 'individual' ELSE 'doble' END),
  'roommate_first_name',split_part(mate,' ',1),'roommate_known',mate IS NOT NULL,'roommate_has_booking',mate_has,
  'existing',CASE WHEN existing.id IS NULL THEN NULL ELSE jsonb_build_object('status',existing.st,'payment_status',existing.ps,'package',existing.pk,'price',existing.pr,'paid',existing.pd,'currency',existing.cu,'reference',upper(left(existing.id::text,8))) END,
  'deposit',jsonb_build_object('url',dep,'amount',500,'currency','EUR'),
  'packages',pkgs,'terms_version',(SELECT metadata->>'terminos_version' FROM events WHERE id=p_event_id),
  'booking_enabled',coalesce((s->>'enabled')::boolean,false),'available',s->'available');
END $function$;

CREATE OR REPLACE FUNCTION public.crosssell_book(p_event_id uuid, p_token text, p_package_id uuid, p_terms_version text, p_room_choice text DEFAULT NULL::text, p_companion_name text DEFAULT NULL::text, p_metodo_pago text DEFAULT 'transferencia'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid; src event_reservations%ROWTYPE; ppr int; mate text; snap jsonb; newid uuid:=gen_random_uuid(); ex uuid; mail text; st text; acomp text; pref boolean; mate_has boolean:=false; wl_n int; wl_id uuid;
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
 SELECT count(*),min(w.id::text)::uuid INTO wl_n,wl_id FROM event_waitlist_entries w
  WHERE w.event_id=p_event_id AND w.origen='solicitud_reserva_sin_pago' AND w.converted_reservation_id IS NULL AND w.estado IN ('nuevo','contactado')
   AND ((src.alumno_id IS NOT NULL AND w.alumno_id=src.alumno_id) OR lower(trim(w.email))=mail);
 IF wl_n=1 THEN
  PERFORM set_config('app.booking_conversion','on',true);
  UPDATE event_waitlist_entries SET converted_reservation_id=newid,converted_at=now(),converted_by=auth.uid(),estado='convertido' WHERE id=wl_id;
  PERFORM set_config('app.booking_conversion','off',true);
  INSERT INTO event_booking_opening_log(event_id,actor,action,detail) VALUES(p_event_id,auth.uid(),'crosssell_request_linked',jsonb_build_object('request_id',wl_id,'reservation_id',newid));
 ELSIF wl_n>1 THEN
  INSERT INTO event_booking_opening_log(event_id,actor,action,detail) VALUES(p_event_id,auth.uid(),'crosssell_request_ambiguous',jsonb_build_object('reservation_id',newid,'matches',wl_n,'note','Varias solicitudes coinciden: revisar a mano; no se vinculó ninguna.'));
 END IF;
 INSERT INTO reservation_status_history(reservation_id,old_reservation_status,new_reservation_status,old_payment_status,new_payment_status,changed_by,changed_by_role,note)
  SELECT newid,NULL,reservation_status,NULL,payment_status,auth.uid(),CASE WHEN auth.uid() IS NULL THEN 'participante_enlace' ELSE 'alumno' END,'Reserva rápida desde reserva activa del viaje vinculado (condiciones '||(snap->>'version')||')' FROM event_reservations WHERE id=newid;
 RETURN jsonb_build_object('ok',true,'already',false,'reservation_id',newid,'rooming',st,'request_linked',coalesce(wl_n,0)=1,'request_ambiguous',coalesce(wl_n,0)>1);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_crosssell_mailing_audience(p_event_id uuid)
 RETURNS TABLE(source_reservation_id uuid, nombre text, email text, cohort text, reason text, roommate text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c event_booking_openings%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 IF c.alps_event_id IS NULL THEN RAISE EXCEPTION 'Viaje de origen no vinculado'; END IF;
 RETURN QUERY
 WITH src AS (
  SELECT r.id, r.alumno_id aid,
   trim(coalesce(nullif(trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,'')),''), trim(coalesce(r.external_first_name,'')||' '||coalesce(r.external_last_name,'')))) nm,
   lower(trim(coalesce(nullif(r.external_email,''),a.email,x.email))) em,
   coalesce((SELECT string_agg(rr.nombre,', ') FROM reservation_roommates rr WHERE rr.reservation_id=r.id), nullif(r.rooming_acompanante_nombre,'')) mate
  FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id LEFT JOIN event_external_participants x ON x.id=r.external_participant_id
  WHERE r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada')
 ), f AS (
  SELECT s.*,
   count(*) OVER (PARTITION BY s.em) dup,
   EXISTS(SELECT 1 FROM event_reservations m LEFT JOIN alumnos b ON b.id=m.alumno_id LEFT JOIN event_external_participants y ON y.id=m.external_participant_id
     WHERE m.event_id=p_event_id AND m.cancelled_at IS NULL AND m.reservation_status NOT IN ('cancelada','rechazada')
       AND ((s.aid IS NOT NULL AND m.alumno_id=s.aid) OR lower(trim(coalesce(nullif(m.external_email,''),b.email,y.email)))=s.em)) res,
   EXISTS(SELECT 1 FROM event_waitlist_entries w WHERE w.event_id=p_event_id AND w.estado<>'descartado' AND ((s.aid IS NOT NULL AND w.alumno_id=s.aid) OR lower(trim(w.email))=s.em)) req_any,
   EXISTS(SELECT 1 FROM event_waitlist_entries w WHERE w.event_id=p_event_id AND w.converted_reservation_id IS NULL AND w.estado IN ('nuevo','contactado') AND ((s.aid IS NOT NULL AND w.alumno_id=s.aid) OR lower(trim(w.email))=s.em)) req_open,
   (EXISTS(SELECT 1 FROM marketing_contacts mc WHERE lower(trim(mc.email))=s.em AND mc.opt_out_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM suppressed_emails se WHERE lower(trim(se.email))=s.em)) oo
  FROM src s
 )
 SELECT f.id, f.nm, f.em,
  CASE WHEN f.em IS NULL OR f.em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR f.dup>1 OR f.oo OR f.res THEN 'excluido'
       WHEN f.req_open THEN 'B'
       WHEN NOT f.req_any THEN 'A'
       ELSE 'excluido' END,
  CASE WHEN f.em IS NULL OR f.em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN 'Correo vacío o inválido'
       WHEN f.dup>1 THEN 'Correo duplicado: revisar'
       WHEN f.oo THEN 'Baja de mailing o correo suprimido'
       WHEN f.res THEN 'Ya tiene reserva de Maratona'
       WHEN f.req_open THEN 'Solicitó Maratona sin completar la reserva'
       WHEN NOT f.req_any THEN 'Titular Alpes sin solicitud ni reserva'
       ELSE 'Solicitud cerrada: revisar' END,
  f.mate
 FROM f ORDER BY 4, f.nm;
END $function$;
REVOKE ALL ON FUNCTION public.admin_crosssell_mailing_audience(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_crosssell_mailing_audience(uuid) TO authenticated;