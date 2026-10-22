CREATE TABLE public.event_crosssell_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.events(id),
 source_reservation_id uuid NOT NULL REFERENCES public.event_reservations(id),
 token_hash text NOT NULL UNIQUE,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 used_reservation_id uuid REFERENCES public.event_reservations(id),
 used_at timestamptz
);
GRANT SELECT ON public.event_crosssell_links TO authenticated;
GRANT ALL ON public.event_crosssell_links TO service_role;
ALTER TABLE public.event_crosssell_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY crosssell_links_admin_read ON public.event_crosssell_links FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE UNIQUE INDEX crosssell_links_one_active ON public.event_crosssell_links(event_id, source_reservation_id) WHERE revoked_at IS NULL AND used_reservation_id IS NULL;

CREATE OR REPLACE FUNCTION public._crosssell_source(p_event_id uuid, p_token text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_booking_openings%ROWTYPE; rid uuid;
BEGIN
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 IF c.alps_event_id IS NULL THEN RETURN NULL; END IF;
 IF nullif(trim(coalesce(p_token,'')),'') IS NOT NULL THEN
  IF length(p_token)<>64 THEN RETURN NULL; END IF;
  SELECT l.source_reservation_id INTO rid FROM event_crosssell_links l
   WHERE l.event_id=p_event_id AND l.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND l.revoked_at IS NULL AND l.expires_at>now();
 ELSIF auth.uid() IS NOT NULL THEN
  SELECT r.id INTO rid FROM event_reservations r JOIN alumnos a ON a.id=r.alumno_id
   WHERE r.event_id=c.alps_event_id AND (a.user_id=auth.uid() OR lower(trim(a.email))=lower(trim(auth.email())))
     AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada')
   ORDER BY r.created_at LIMIT 1;
 END IF;
 IF rid IS NULL OR NOT EXISTS(SELECT 1 FROM event_reservations r WHERE r.id=rid AND r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada')) THEN RETURN NULL; END IF;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public._crosssell_source(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_issue_crosssell_link(p_event_id uuid, p_source_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_booking_openings%ROWTYPE; tok text;
BEGIN
 IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 IF c.alps_event_id IS NULL THEN RAISE EXCEPTION 'Viaje de origen no vinculado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM event_reservations r WHERE r.id=p_source_reservation_id AND r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada')) THEN RAISE EXCEPTION 'La reserva de origen no está activa'; END IF;
 UPDATE event_crosssell_links SET revoked_at=now() WHERE event_id=p_event_id AND source_reservation_id=p_source_reservation_id AND revoked_at IS NULL AND used_reservation_id IS NULL;
 tok:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO event_crosssell_links(event_id,source_reservation_id,token_hash,created_by,expires_at)
  VALUES(p_event_id,p_source_reservation_id,encode(extensions.digest(tok,'sha256'),'hex'),auth.uid(),now()+interval '30 days');
 RETURN jsonb_build_object('token',tok,'expires_at',now()+interval '30 days');
END $$;
REVOKE ALL ON FUNCTION public.admin_issue_crosssell_link(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_issue_crosssell_link(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_crosssell_context(p_event_id uuid, p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; r record; mate text; mail text; existing record; pkgs jsonb; mate_has boolean:=false; s jsonb;
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
 SELECT m.id, m.reservation_status::text st, m.package_nombre_snapshot pk INTO existing FROM event_reservations m LEFT JOIN alumnos b ON b.id=m.alumno_id
  WHERE m.event_id=p_event_id AND m.cancelled_at IS NULL AND m.reservation_status NOT IN ('cancelada','rechazada')
   AND ((r.alumno_id IS NOT NULL AND m.alumno_id=r.alumno_id) OR lower(trim(coalesce(nullif(m.external_email,''),b.email)))=r.em) LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'precio',p.precio,'currency',p.currency,'bike',o->>'bike','combined_total',p.precio+coalesce(r.price_snapshot,r.amount_total,0)) ORDER BY p.precio DESC),'[]')
  INTO pkgs FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'reservation_request'->'packages') o JOIN event_packages p ON p.id=(o->>'id')::uuid
  WHERE e.id=p_event_id AND o->>'requires_alps'='true' AND p.activo;
 s:=event_booking_opening_status(p_event_id);
 mail:=CASE WHEN r.em ~ '@' THEN left(split_part(r.em,'@',1),2)||'•••@'||split_part(r.em,'@',2) END;
 RETURN jsonb_build_object('eligible',true,'via',CASE WHEN nullif(trim(coalesce(p_token,'')),'') IS NULL THEN 'sesion' ELSE 'enlace' END,
  'first_name',r.fn,'last_name',r.ln,'email_masked',mail,
  'source',jsonb_build_object('status',r.reservation_status,'package',r.pkg_nombre,'price',coalesce(r.price_snapshot,r.amount_total),'currency',coalesce(r.currency_snapshot,'EUR'),'room',CASE WHEN r.ppr=1 THEN 'individual' ELSE 'doble' END),
  'roommate_first_name',split_part(mate,' ',1),'roommate_known',mate IS NOT NULL,'roommate_has_booking',mate_has,
  'existing',CASE WHEN existing.id IS NULL THEN NULL ELSE jsonb_build_object('status',existing.st,'package',existing.pk) END,
  'packages',pkgs,'terms_version',(SELECT metadata->>'terminos_version' FROM events WHERE id=p_event_id),
  'booking_enabled',coalesce((s->>'enabled')::boolean,false),'available',s->'available');
END $$;
REVOKE ALL ON FUNCTION public.get_crosssell_context(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crosssell_context(uuid,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.crosssell_book(p_event_id uuid, p_token text, p_package_id uuid, p_terms_version text, p_room_choice text DEFAULT NULL, p_companion_name text DEFAULT NULL, p_metodo_pago text DEFAULT 'transferencia')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; src event_reservations%ROWTYPE; ppr int; mate text; snap jsonb; newid uuid:=gen_random_uuid(); ex uuid; mail text; st text; acomp text; pref boolean; mate_has boolean:=false;
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
 INSERT INTO reservation_status_history(reservation_id,old_reservation_status,new_reservation_status,old_payment_status,new_payment_status,changed_by,changed_by_role,note)
  SELECT newid,NULL,reservation_status,NULL,payment_status,auth.uid(),CASE WHEN auth.uid() IS NULL THEN 'participante_enlace' ELSE 'alumno' END,'Reserva rápida desde reserva activa del viaje vinculado (condiciones '||(snap->>'version')||')' FROM event_reservations WHERE id=newid;
 RETURN jsonb_build_object('ok',true,'already',false,'reservation_id',newid,'rooming',st);
END $$;
REVOKE ALL ON FUNCTION public.crosssell_book(uuid,text,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crosssell_book(uuid,text,uuid,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._booking_alps_eligible(p_event_id uuid,p_package_id uuid,p_alumno_id uuid,p_email text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_booking_openings%ROWTYPE; opt jsonb; is_admin boolean; srcid text;
BEGIN
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 SELECT value INTO opt FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'reservation_request'->'packages') WHERE e.id=p_event_id AND value->>'id'=p_package_id::text;
 IF opt IS NULL THEN RETURN false; END IF;
 IF opt->>'requires_alps'<>'true' THEN RETURN true; END IF;
 IF c.alps_event_id IS NULL THEN RETURN false; END IF;
 srcid:=nullif(current_setting('app.crosssell_source',true),'');
 IF srcid IS NOT NULL THEN
  RETURN EXISTS(SELECT 1 FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id WHERE r.id=srcid::uuid AND r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada')
   AND ((p_alumno_id IS NOT NULL AND r.alumno_id=p_alumno_id) OR lower(trim(coalesce(nullif(r.external_email,''),a.email)))=lower(trim(p_email))));
 END IF;
 is_admin:=auth.uid() IS NOT NULL AND (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid()));
 IF NOT is_admin THEN
  IF auth.uid() IS NULL OR p_alumno_id IS NULL OR NOT EXISTS(SELECT 1 FROM alumnos a WHERE a.id=p_alumno_id AND (a.user_id=auth.uid() OR lower(trim(a.email))=lower(trim(auth.email())))) THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM event_reservations r WHERE r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada') AND r.alumno_id=p_alumno_id);
 END IF;
 RETURN EXISTS(SELECT 1 FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id WHERE r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada') AND (r.alumno_id=p_alumno_id OR lower(trim(r.external_email))=lower(trim(p_email)) OR lower(trim(a.email))=lower(trim(p_email))));
END $$;
REVOKE ALL ON FUNCTION public._booking_alps_eligible(uuid,uuid,uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_booking_crosssell_audience(p_event_id uuid, p_source_event_id uuid)
RETURNS TABLE(source_reservation_id uuid, nombre text, email text, source_status text, already_requested boolean, already_reserved boolean, marketing_opt_out boolean, alps_rate_eligible boolean, roommate text, invite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_event_id = p_source_event_id THEN RAISE EXCEPTION 'El viaje de origen debe ser distinto'; END IF;
 RETURN QUERY
 WITH src AS (
  SELECT r.id, r.reservation_status::text st,
   trim(coalesce(nullif(trim(coalesce(a.nombre,'')||' '||coalesce(a.apellido,'')),''), trim(coalesce(r.external_first_name,'')||' '||coalesce(r.external_last_name,'')))) nm,
   lower(trim(coalesce(nullif(r.external_email,''),a.email))) em,
   coalesce((SELECT string_agg(rr.nombre,', ') FROM reservation_roommates rr WHERE rr.reservation_id=r.id), nullif(r.rooming_acompanante_nombre,'')) mate
  FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id
  WHERE r.event_id=p_source_event_id AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada')
 ), f AS (
  SELECT s.*,
   EXISTS(SELECT 1 FROM event_waitlist_entries w WHERE w.event_id=p_event_id AND lower(trim(w.email))=s.em) req,
   EXISTS(SELECT 1 FROM event_reservations x LEFT JOIN alumnos b ON b.id=x.alumno_id WHERE x.event_id=p_event_id AND x.cancelled_at IS NULL AND x.reservation_status NOT IN ('cancelada','rechazada') AND lower(trim(coalesce(nullif(x.external_email,''),b.email)))=s.em) res,
   EXISTS(SELECT 1 FROM marketing_contacts m WHERE lower(trim(m.email))=s.em AND m.opt_out_at IS NOT NULL) oo
  FROM src s
 )
 SELECT f.id, f.nm, f.em, f.st, f.req, f.res, f.oo, f.st IN ('solicitud_enviada','reserva_confirmada'), f.mate,
  (NOT f.req AND NOT f.res AND NOT f.oo AND f.em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
 FROM f ORDER BY f.nm;
END $$;
REVOKE ALL ON FUNCTION public.admin_booking_crosssell_audience(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_booking_crosssell_audience(uuid,uuid) TO authenticated;