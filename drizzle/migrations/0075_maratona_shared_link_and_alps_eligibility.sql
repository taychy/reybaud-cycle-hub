CREATE OR REPLACE FUNCTION public.event_booking_opening_status(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.event_booking_openings%ROWTYPE; e public.events%ROWTYPE; blockers jsonb:='[]'; cap integer:=0; used integer:=0; opt jsonb; pkg record; plan record; snap jsonb; n integer;
BEGIN
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('controlled',false,'enabled',false,'ready',false,'available',0,'blockers','[]'::jsonb); END IF;
 SELECT * INTO e FROM events WHERE id=p_event_id;
 cap:=greatest(0,least(coalesce(c.hotel_capacity,0),coalesce(c.race_capacity,0)));
 IF cap=0 OR nullif(trim(c.hotel_evidence),'') IS NULL OR nullif(trim(c.race_evidence),'') IS NULL THEN blockers:=blockers||jsonb_build_array('Falta confirmar capacidad y respaldo de hotel y carrera.'); END IF;
 IF NOT c.payment_verified OR coalesce(c.payment_url,'') !~ '^https://[^/[:space:]]+/.+' OR c.payment_url IS DISTINCT FROM e.metadata->'payment_links'->>'deposit_url' OR coalesce(e.metadata->'payment_links'->>'deposit_currency','')<>'EUR' OR coalesce(e.metadata->'payment_links'->>'deposit_amount','')<>'500' THEN blockers:=blockers||jsonb_build_array('Falta un enlace de pago verificado para la seña de EUR 500.'); END IF;
 IF NOT e.is_active OR e.estado_publicacion<>'publicado' OR e.payment_mode::text<>'cuotas' THEN blockers:=blockers||jsonb_build_array('El evento debe estar público y configurado con cuotas.'); END IF;
 IF coalesce(e.metadata->'reservation_request'->>'mode','')<>'pending_no_payment' THEN blockers:=blockers||jsonb_build_array('Conservar recepción de solicitudes como alternativa segura.'); END IF;
 IF nullif(e.metadata->>'terminos_version','') IS NULL OR public.event_terms_snapshot(p_event_id) IS NULL THEN blockers:=blockers||jsonb_build_array('Faltan condiciones versionadas.'); END IF;
 IF jsonb_array_length(coalesce(e.metadata->'reservation_request'->'packages','[]'))<>4 THEN blockers:=blockers||jsonb_build_array('Se requieren las cuatro modalidades comerciales.'); END IF;
 FOR opt IN SELECT value FROM jsonb_array_elements(coalesce(e.metadata->'reservation_request'->'packages','[]')) LOOP
  SELECT * INTO pkg FROM event_packages WHERE id=(opt->>'id')::uuid AND event_id=p_event_id;
  IF NOT FOUND OR NOT pkg.activo OR pkg.currency<>'EUR' OR pkg.personas_por_habitacion<>2 OR pkg.cupo IS NOT NULL OR coalesce(pkg.sin_alojamiento,false) THEN blockers:=blockers||jsonb_build_array('Paquetes pendientes: activos, EUR, habitación doble y sin cupos duplicados por tarifa.'); CONTINUE; END IF;
  SELECT count(*) INTO n FROM event_package_payment_plans WHERE package_id=pkg.id AND activo AND archived_at IS NULL AND price_stage_id IS NULL;
  IF n<>1 THEN blockers:=blockers||jsonb_build_array('Cada modalidad requiere un único plan activo.'); CONTINUE; END IF;
  SELECT * INTO plan FROM event_package_payment_plans WHERE package_id=pkg.id AND activo AND archived_at IS NULL AND price_stage_id IS NULL;
  IF plan.sena_tipo::text<>'monto_fijo' OR plan.sena_valor<>500 OR plan.cantidad_cuotas<>8 OR (SELECT count(*) FROM event_package_payment_plan_installments WHERE plan_id=plan.id)<>8 THEN blockers:=blockers||jsonb_build_array('Los planes deben conservar seña EUR 500 y ocho cuotas.'); CONTINUE; END IF;
  BEGIN snap:=build_payment_plan_snapshot(plan.id,pkg.precio,current_date); EXCEPTION WHEN others THEN blockers:=blockers||jsonb_build_array('El plan de cuotas no concilia con el precio.'); END;
 END LOOP;
 IF c.alps_event_id IS NULL OR NOT EXISTS(SELECT 1 FROM events WHERE id=c.alps_event_id AND id<>p_event_id) THEN blockers:=blockers||jsonb_build_array('Falta vincular el viaje Alpes que habilita la tarifa especial.'); END IF;
 IF NOT c.native_flow_verified THEN blockers:=blockers||jsonb_build_array('Flujo nativo pendiente de despliegue autorizado y verificación; apertura bloqueada.'); END IF;
 SELECT count(*) INTO used FROM event_reservations WHERE event_id=p_event_id AND cancelled_at IS NULL AND reservation_status NOT IN ('cancelada','rechazada');
 IF used>cap THEN blockers:=blockers||jsonb_build_array('Las reservas exceden el pool global.'); END IF;
 RETURN jsonb_build_object('controlled',true,'enabled',c.enabled AND jsonb_array_length(blockers)=0,'ready',jsonb_array_length(blockers)=0,'capacity',cap,'available',greatest(cap-used,0),'deposit',500,'installments',8,'blockers',blockers);
END $$;

CREATE OR REPLACE FUNCTION public._booking_alps_eligible(p_event_id uuid,p_package_id uuid,p_alumno_id uuid,p_email text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_booking_openings%ROWTYPE; opt jsonb; is_admin boolean;
BEGIN
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 SELECT value INTO opt FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'reservation_request'->'packages') WHERE e.id=p_event_id AND value->>'id'=p_package_id::text;
 IF opt IS NULL THEN RETURN false; END IF;
 IF opt->>'requires_alps'<>'true' THEN RETURN true; END IF;
 IF c.alps_event_id IS NULL THEN RETURN false; END IF;
 is_admin:=auth.uid() IS NOT NULL AND (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid()));
 IF NOT is_admin THEN
  IF auth.uid() IS NULL OR p_alumno_id IS NULL OR NOT EXISTS(SELECT 1 FROM alumnos a WHERE a.id=p_alumno_id AND (a.user_id=auth.uid() OR lower(trim(a.email))=lower(trim(auth.email())))) THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM event_reservations r WHERE r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada') AND r.alumno_id=p_alumno_id);
 END IF;
 RETURN EXISTS(SELECT 1 FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id WHERE r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status IN ('solicitud_enviada','reserva_confirmada') AND (r.alumno_id=p_alumno_id OR lower(trim(r.external_email))=lower(trim(p_email)) OR lower(trim(a.email))=lower(trim(p_email))));
END $$;
REVOKE ALL ON FUNCTION public._booking_alps_eligible(uuid,uuid,uuid,text) FROM PUBLIC;