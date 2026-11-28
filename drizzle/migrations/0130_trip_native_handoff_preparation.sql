-- Preparation is opt-in and OFF. Payment gate from 0129 stays CHECK(false).
ALTER TABLE public.trip_capacity_pools ADD COLUMN native_preparation_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.trip_capacity_pools ADD COLUMN native_payment_schedule jsonb;
UPDATE public.trip_capacity_pools SET native_payment_schedule='{"deposit_percent":30,"installments":[{"number":1,"balance_percent":50,"due_date":"2026-12-15"},{"number":2,"balance_percent":50,"due_date":"2027-01-10"}]}'::jsonb WHERE id='07180718-2027-4027-8027-000000000039';
ALTER TABLE public.trip_capacity_packages ADD COLUMN native_payment_plan_id uuid REFERENCES public.event_package_payment_plans(id);
CREATE TABLE public.trip_capacity_reservation_links (
 request_id uuid NOT NULL REFERENCES public.event_enrollment_requests(id),
 attendee_index integer NOT NULL CHECK(attendee_index>=0),
 reservation_id uuid NOT NULL UNIQUE REFERENCES public.event_reservations(id) DEFERRABLE INITIALLY DEFERRED,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(request_id,attendee_index)
);
GRANT SELECT ON public.trip_capacity_reservation_links TO authenticated;
GRANT ALL ON public.trip_capacity_reservation_links TO service_role;
ALTER TABLE public.trip_capacity_reservation_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY native_link_admin_read ON public.trip_capacity_reservation_links FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
COMMENT ON TABLE public.trip_capacity_reservation_links IS 'One native reservation per identified attendee. Links and the complete group are committed atomically. Replaces hold occupancy; never duplicates it. No client writes.';
-- Inactive native templates initialize the new mapping. No packages/prices/events activated.
INSERT INTO public.event_package_payment_plans(id,package_id,nombre,sena_tipo,sena_valor,sena_vence_dias,cantidad_cuotas,last_installment_absorbs_rounding,regla_reserva_tardia,activo,version)
SELECT md5('trip-native-30-35-35:'||m.package_id)::uuid,m.package_id,'San Luis enero 2027 · 30/35/35','porcentaje_paquete',30,0,2,true,'cobrar_al_reservar',false,coalesce((SELECT max(p.version) FROM public.event_package_payment_plans p WHERE p.package_id=m.package_id),0)+1
FROM public.trip_capacity_packages m JOIN public.trip_capacity_events e ON e.pool_id=m.pool_id JOIN public.event_packages pkg ON pkg.id=m.package_id AND pkg.event_id=e.event_id
WHERE e.event_id IN ('408a8eb8-fb62-4a50-ad6d-040bd5716797','5380df24-6bbf-4d25-81cd-a1ab2b41bd94');
INSERT INTO public.event_package_payment_plan_installments(plan_id,numero,descripcion,monto_tipo,monto_valor,fecha_vencimiento,reminders_config)
SELECT p.id,s.numero,s.descripcion,'porcentaje_saldo',50,s.vencimiento,'[]'::jsonb
FROM public.event_package_payment_plans p CROSS JOIN (VALUES(1,'Primera cuota'::text,'2026-12-15'::date),(2,'Segunda cuota','2027-01-10'::date)) s(numero,descripcion,vencimiento)
WHERE p.id=md5('trip-native-30-35-35:'||p.package_id)::uuid;
UPDATE public.trip_capacity_packages m SET native_payment_plan_id=p.id FROM public.event_package_payment_plans p WHERE p.id=md5('trip-native-30-35-35:'||m.package_id)::uuid;
CREATE OR REPLACE FUNCTION public.get_trip_request_capacity(p_event_id uuid,p_package_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; g record; n date; used_total integer; used_group integer; used_camp integer; available integer;
BEGIN
 SELECT e.*,p.total_capacity INTO c FROM public.trip_capacity_events e JOIN public.trip_capacity_pools p ON p.id=e.pool_id WHERE e.event_id=p_event_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT grp.* INTO g FROM public.trip_capacity_packages m JOIN public.trip_capacity_groups grp USING(pool_id,group_key) JOIN public.event_packages p ON p.id=m.package_id WHERE m.package_id=p_package_id AND p.event_id=p_event_id AND m.pool_id=c.pool_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT coalesce(sum(o.people),0) INTO used_camp FROM (
 SELECT r.event_id,h.people_count people FROM public.trip_capacity_holds h JOIN public.event_enrollment_requests r ON r.id=h.request_id WHERE h.pool_id=c.pool_id AND h.released_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.trip_capacity_reservation_links l WHERE l.request_id=h.request_id)
 UNION ALL SELECT r.event_id,1 FROM public.event_reservations r JOIN public.trip_capacity_events e ON e.event_id=r.event_id WHERE e.pool_id=c.pool_id AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada')
 ) o WHERE o.event_id=p_event_id;
 available:=c.commercial_cap-used_camp;
 FOR n IN SELECT generate_series(c.check_in,c.check_out-1,interval '1 day')::date LOOP
 SELECT coalesce(sum(o.people),0),coalesce(sum(o.people) FILTER(WHERE o.group_key=g.group_key),0) INTO used_total,used_group FROM (
 SELECT r.event_id,h.group_key,h.people_count people FROM public.trip_capacity_holds h JOIN public.event_enrollment_requests r ON r.id=h.request_id WHERE h.pool_id=c.pool_id AND h.released_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.trip_capacity_reservation_links l WHERE l.request_id=h.request_id)
 UNION ALL SELECT r.event_id,m.group_key,1 FROM public.event_reservations r JOIN public.trip_capacity_packages m ON m.package_id=r.package_id WHERE m.pool_id=c.pool_id AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada')
 ) o JOIN public.trip_capacity_events e ON e.event_id=o.event_id WHERE e.check_in<=n AND e.check_out>n;
 available:=least(available,c.total_capacity-used_total,g.room_count*g.places_per_room-used_group);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'remaining',greatest(0,available),'total_capacity',c.total_capacity,'group_capacity',g.room_count*g.places_per_room,'commercial_cap',c.commercial_cap,'payment_enabled',false,'requires_hotel_validation',true);
END $$;
CREATE OR REPLACE FUNCTION public._trip_native_terms_ready(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(metadata->'terms_validation'->>'status'='validated'
 AND nullif(metadata->>'terminos_version','') IS NOT NULL
 AND metadata->'terms_validation'->>'version'=metadata->>'terminos_version'
 AND length(trim(coalesce(metadata->>'politica_sena','')))>0
 AND length(trim(coalesce(metadata->>'politica_cancelacion','')))>0
 AND length(trim(coalesce(metadata->>'politica_pagos','')))>0
 AND length(trim(coalesce(metadata->>'reglamento_texto','')))>0
 AND (coalesce(metadata->>'politica_sena','')||coalesce(metadata->>'politica_cancelacion','')||coalesce(metadata->>'politica_pagos','')||coalesce(metadata->>'reglamento_texto','')) !~* '(PENDIENTE|120 días|30/09/2026)',false)
 FROM public.events WHERE id=p_event_id
$$;
REVOKE ALL ON FUNCTION public._trip_native_terms_ready(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_trip_native_preflight(p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; c record; blockers jsonb:='[]'; links integer;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Solo administración'; END IF;
 SELECT * INTO r FROM public.event_enrollment_requests WHERE id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
 SELECT e.*,p.native_preparation_enabled,m.native_payment_plan_id INTO c FROM public.trip_capacity_events e JOIN public.trip_capacity_pools p ON p.id=e.pool_id JOIN public.trip_capacity_packages m ON m.package_id=r.package_id AND m.pool_id=e.pool_id WHERE e.event_id=r.event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud fuera del circuito'; END IF;
 SELECT count(*) INTO links FROM public.trip_capacity_reservation_links WHERE request_id=r.id;
 IF NOT c.native_preparation_enabled THEN blockers:=blockers||jsonb_build_array('Preparación nativa deshabilitada hasta revisión de condiciones y pruebas completas.'); END IF;
 IF public._trip_native_terms_ready(r.event_id) IS DISTINCT FROM true THEN blockers:=blockers||jsonb_build_array('Falta aprobar las condiciones finales de cancelación, reprogramación e inclusiones; no se usarán términos genéricos.'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_capacity_holds WHERE request_id=r.id AND released_at IS NULL) OR r.status<>'aprobada_cotizacion' OR NOT r.hotel_validated OR r.approved_unit_price IS NULL THEN blockers:=blockers||jsonb_build_array('Falta cotización aprobada, validación hotelera y retención activa para todas las personas.'); END IF;
 IF c.native_payment_plan_id IS NULL THEN blockers:=blockers||jsonb_build_array('Falta el plan nativo de pagos.'); END IF;
 RETURN jsonb_build_object('ok',true,'can_prepare',jsonb_array_length(blockers)=0,'blockers',blockers,'converted',links>0,'reservation_count',links,'payment_enabled',false);
END $$;
REVOKE ALL ON FUNCTION public.admin_trip_native_preflight(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_trip_native_preflight(uuid) TO authenticated,service_role;
-- Final guard runs after existing native before-insert triggers. A client cannot manufacture links.
CREATE OR REPLACE FUNCTION public._trip_capacity_native_closed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; l record; r record;
BEGIN
 IF TG_OP='UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id AND EXISTS(SELECT 1 FROM public.trip_capacity_events WHERE event_id=OLD.event_id) THEN RAISE EXCEPTION 'No se puede mover esta reserva a otro evento'; END IF;
 SELECT e.*,p.native_preparation_enabled,p.payment_handoff_enabled INTO c FROM public.trip_capacity_events e JOIN public.trip_capacity_pools p ON p.id=e.pool_id WHERE e.event_id=CASE WHEN TG_OP='DELETE' THEN OLD.event_id ELSE NEW.event_id END;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 PERFORM 1 FROM public.trip_capacity_pools WHERE id=c.pool_id FOR UPDATE;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conservá la reserva e historial; usá cancelación administrativa'; END IF;
 IF TG_OP='INSERT' THEN
 SELECT req.*,h.group_key INTO r FROM public.trip_capacity_reservation_links x JOIN public.event_enrollment_requests req ON req.id=x.request_id JOIN public.trip_capacity_holds h ON h.request_id=req.id AND h.released_at IS NULL WHERE x.reservation_id=NEW.id;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) OR NOT c.native_preparation_enabled OR public._trip_native_terms_ready(NEW.event_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reserva y cobro bloqueados: requiere conversión administrativa y condiciones finales validadas'; END IF;
 IF NEW.event_id IS DISTINCT FROM r.event_id OR NEW.package_id IS DISTINCT FROM r.package_id OR NEW.amount_total IS DISTINCT FROM r.approved_unit_price OR NEW.amount_paid<>0 OR NEW.confirmed_at IS NOT NULL OR NEW.reservation_status<>'solicitud_enviada' OR NEW.accepted_terms OR NOT NEW.terminos_pendientes THEN RAISE EXCEPTION 'Alta nativa inconsistente con la solicitud validada'; END IF;
 ELSE
 IF (NEW.event_id,NEW.package_id,NEW.alumno_id,NEW.external_participant_id,NEW.external_email,NEW.external_first_name,NEW.external_last_name,NEW.amount_total,NEW.price_snapshot,NEW.currency_snapshot,NEW.moneda,NEW.monto,NEW.payment_plan_id,NEW.payment_plan_snapshot) IS DISTINCT FROM (OLD.event_id,OLD.package_id,OLD.alumno_id,OLD.external_participant_id,OLD.external_email,OLD.external_first_name,OLD.external_last_name,OLD.amount_total,OLD.price_snapshot,OLD.currency_snapshot,OLD.moneda,OLD.monto,OLD.payment_plan_id,OLD.payment_plan_snapshot) THEN RAISE EXCEPTION 'Identidad, paquete y contrato inmutables: requieren corrección auditada de inventario'; END IF;
 IF (NEW.terminos_pendientes,NEW.accepted_terms,NEW.terminos_aceptados_at,NEW.terminos_snapshot,NEW.terminos_version_aceptada) IS DISTINCT FROM (OLD.terminos_pendientes,OLD.accepted_terms,OLD.terminos_aceptados_at,OLD.terminos_snapshot,OLD.terminos_version_aceptada) AND current_setting('app.terms_internal',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Solo el participante acepta mediante el circuito de condiciones'; END IF;
 IF OLD.cancelled_at IS NOT NULL OR OLD.reservation_status IN ('cancelada','rechazada') THEN
 IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR NEW.reservation_status IS DISTINCT FROM OLD.reservation_status THEN RAISE EXCEPTION 'No se puede reactivar un cupo liberado'; END IF;
 END IF;
 IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR NEW.reservation_status IS DISTINCT FROM OLD.reservation_status THEN
 IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Cambio de estado solo administrativo'; END IF;
 IF NEW.cancelled_at IS NULL OR NEW.reservation_status NOT IN ('cancelada','rechazada') THEN RAISE EXCEPTION 'Confirmación bloqueada hasta aceptación y circuito de pago verificado'; END IF;
 INSERT INTO public.event_enrollment_request_history(request_id,actor_user_id,action,from_status,to_status,review_note,details) SELECT request_id,auth.uid(),'reserva_cancelada',NULL,NULL,'Cancelación nativa: capacidad liberada sin modificar pagos',jsonb_build_object('reservation_id',NEW.id) FROM public.trip_capacity_reservation_links WHERE reservation_id=NEW.id;
 END IF;
 IF NEW.confirmed_at IS NOT NULL OR (NOT c.payment_handoff_enabled AND NEW.amount_paid<>0) THEN RAISE EXCEPTION 'Cobro y confirmación bloqueados hasta prueba end-to-end y aceptación'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trip_capacity_native_closed ON public.event_reservations;
CREATE TRIGGER zzzzz_trip_capacity_native_guard BEFORE INSERT OR UPDATE OR DELETE ON public.event_reservations FOR EACH ROW EXECUTE FUNCTION public._trip_capacity_native_closed();
CREATE OR REPLACE FUNCTION public._trip_converted_hold_release_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.trip_capacity_reservation_links WHERE request_id=OLD.request_id) THEN RAISE EXCEPTION 'Retención convertida: cancelá las reservas nativas; no liberar ni modificar la retención'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trip_converted_hold_release_guard BEFORE UPDATE OR DELETE ON public.trip_capacity_holds FOR EACH ROW EXECUTE FUNCTION public._trip_converted_hold_release_guard();
CREATE OR REPLACE FUNCTION public._trip_native_payment_closed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.event_reservations r JOIN public.trip_capacity_events e ON e.event_id=r.event_id WHERE r.id=NEW.reservation_id) THEN RAISE EXCEPTION 'Cobro bloqueado: no hay habilitación end-to-end ni instrucciones de pago aprobadas'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_trip_native_payment_closed BEFORE INSERT OR UPDATE ON public.reservation_payments FOR EACH ROW EXECUTE FUNCTION public._trip_native_payment_closed();
CREATE OR REPLACE FUNCTION public.admin_prepare_trip_native_reservations(p_request_id uuid,p_participant_emails text[],p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE req record; c record; h record; m record; plan record; identity record; a jsonb; snap jsonb; gate jsonb; idx integer; mail text; rid uuid; result jsonb:='[]'; linked integer; today date:=(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Solo administración'; END IF;
 IF length(trim(coalesce(p_note,'')))<3 THEN RAISE EXCEPTION 'Registrá la validación de identidad y condiciones'; END IF;
 SELECT e.*,pool.native_payment_schedule INTO c FROM public.event_enrollment_requests r JOIN public.trip_capacity_events e ON e.event_id=r.event_id JOIN public.trip_capacity_pools pool ON pool.id=e.pool_id WHERE r.id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud fuera del circuito'; END IF;
 PERFORM 1 FROM public.trip_capacity_pools WHERE id=c.pool_id FOR UPDATE;
 SELECT * INTO req FROM public.event_enrollment_requests WHERE id=p_request_id FOR UPDATE;
 SELECT count(*) INTO linked FROM public.trip_capacity_reservation_links WHERE request_id=req.id;
 IF linked>0 THEN
 IF linked<>req.people_count THEN RAISE EXCEPTION 'Conversión incompleta: revisión administrativa'; END IF;
 RETURN jsonb_build_object('ok',true,'duplicate',true,'payment_enabled',false,'reservations',(SELECT jsonb_agg(reservation_id ORDER BY attendee_index) FROM public.trip_capacity_reservation_links WHERE request_id=req.id));
 END IF;
 gate:=public.admin_trip_native_preflight(req.id);
 IF gate->>'can_prepare'<>'true' THEN RAISE EXCEPTION 'Preparación bloqueada: %',gate->'blockers'; END IF;
 SELECT * INTO h FROM public.trip_capacity_holds WHERE request_id=req.id AND released_at IS NULL;
 SELECT * INTO m FROM public.trip_capacity_packages WHERE package_id=req.package_id;
 IF h.pool_id<>c.pool_id OR h.group_key<>m.group_key OR h.people_count<>req.people_count OR h.approved_unit_price<>req.approved_unit_price THEN RAISE EXCEPTION 'Retención inconsistente'; END IF;
 IF array_length(p_participant_emails,1) IS DISTINCT FROM req.people_count OR jsonb_array_length(req.attendees)<>req.people_count THEN RAISE EXCEPTION 'Identificá individualmente a todas las personas'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_participant_emails) e GROUP BY lower(trim(e)) HAVING count(*)>1) THEN RAISE EXCEPTION 'Cada participante debe tener un contacto individual diferente'; END IF;
 SELECT * INTO plan FROM public.event_package_payment_plans WHERE id=m.native_payment_plan_id AND package_id=req.package_id AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND OR plan.sena_tipo<>'porcentaje_paquete' OR plan.sena_valor IS DISTINCT FROM (c.native_payment_schedule->>'deposit_percent')::numeric OR plan.sena_vence_dias<>0 OR plan.cantidad_cuotas<>2 OR plan.regla_reserva_tardia<>'cobrar_al_reservar' THEN RAISE EXCEPTION 'Plan nativo incompatible con 30/35/35'; END IF;
 PERFORM 1 FROM public.event_package_payment_plan_installments WHERE plan_id=plan.id FOR SHARE;
 IF c.native_payment_schedule IS NULL OR (SELECT count(*) FROM public.event_package_payment_plan_installments WHERE plan_id=plan.id)<>jsonb_array_length(c.native_payment_schedule->'installments') OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.native_payment_schedule->'installments') expected WHERE NOT EXISTS(SELECT 1 FROM public.event_package_payment_plan_installments actual WHERE actual.plan_id=plan.id AND actual.numero=(expected->>'number')::integer AND actual.monto_tipo='porcentaje_saldo' AND actual.monto_valor=(expected->>'balance_percent')::numeric AND actual.fecha_vencimiento=(expected->>'due_date')::date)) THEN RAISE EXCEPTION 'Vencimientos o porcentajes no aprobados'; END IF;
 snap:=public.build_payment_plan_snapshot(plan.id,req.approved_unit_price,today);
 -- Native builder folds strictly overdue installments into the deposit; due-today installments stay independently due today.
 IF (snap->'calculated'->>'total')::numeric<>req.approved_unit_price THEN RAISE EXCEPTION 'Plan inconsistente'; END IF;
 FOR idx IN 0..req.people_count-1 LOOP
 a:=req.attendees->idx; mail:=lower(trim(p_participant_emails[idx+1]));
 IF mail IS NULL OR mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Contacto individual inválido'; END IF;
 -- Resolve existing identities only. Never overwrite a historical external participant or trust a public alumno_id.
 IF (SELECT count(*) FROM public.alumnos WHERE lower(trim(email))=mail)>1 OR (SELECT count(*) FROM public.event_external_participants WHERE lower(trim(email))=mail)>1 THEN RAISE EXCEPTION 'Contacto individual ambiguo: revisión administrativa'; END IF;
 SELECT id AS alumno_id,NULL::uuid AS external_id,nombre,apellido INTO identity FROM public.alumnos WHERE lower(trim(email))=mail;
 IF NOT FOUND THEN
 SELECT NULL::uuid AS alumno_id,id AS external_id,nombre,apellido INTO identity FROM public.event_external_participants WHERE lower(trim(email))=mail;
 END IF;
 IF NOT FOUND OR lower(trim(identity.nombre)) IS DISTINCT FROM lower(trim(a->>'firstName')) OR lower(trim(identity.apellido)) IS DISTINCT FROM lower(trim(a->>'lastName')) THEN RAISE EXCEPTION 'Revisá la ficha individual y el nombre de %; no se crean ni modifican identidades automáticamente',mail; END IF;
 IF EXISTS(SELECT 1 FROM public.event_reservations r JOIN public.trip_capacity_events e ON e.event_id=r.event_id WHERE e.pool_id=c.pool_id AND e.check_in<c.check_out AND e.check_out>c.check_in AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada') AND (r.alumno_id=identity.alumno_id OR r.external_participant_id=identity.external_id OR lower(trim(r.external_email))=mail)) THEN RAISE EXCEPTION 'Esta persona ya tiene una reserva en fechas superpuestas'; END IF;
 rid:=gen_random_uuid();
 INSERT INTO public.trip_capacity_reservation_links(request_id,attendee_index,reservation_id,created_by) VALUES(req.id,idx,rid,auth.uid());
 INSERT INTO public.event_reservations(id,event_id,alumno_id,external_participant_id,external_email,external_first_name,external_last_name,package_id,package_nombre_snapshot,reservation_status,payment_status,estado,metodo_pago,amount_total,amount_paid,balance_due,price_snapshot,currency_snapshot,moneda,monto,payment_plan_id,payment_plan_name_snapshot,payment_plan_snapshot,created_by,accepted_terms,terminos_pendientes)
 SELECT rid,req.event_id,identity.alumno_id,identity.external_id,mail,identity.nombre,identity.apellido,req.package_id,p.nombre,'solicitud_enviada','no_informado','solicitud_enviada','pendiente',req.approved_unit_price,0,req.approved_unit_price,req.approved_unit_price,req.currency,req.currency,req.approved_unit_price,plan.id,plan.nombre,snap,'admin',false,true FROM public.event_packages p WHERE p.id=req.package_id AND p.event_id=req.event_id;
 PERFORM public.materialize_reservation_installments(rid);
 IF (SELECT sum(amount) FROM public.reservation_installments WHERE reservation_id=rid) IS DISTINCT FROM req.approved_unit_price OR NOT EXISTS(SELECT 1 FROM public.reservation_installments WHERE reservation_id=rid AND installment_type='sena') THEN RAISE EXCEPTION 'Cuotas nativas incompletas'; END IF;
 INSERT INTO public.reservation_status_history(reservation_id,old_reservation_status,new_reservation_status,old_payment_status,new_payment_status,changed_by,changed_by_role,note) VALUES(rid,NULL,'solicitud_enviada',NULL,'no_informado',auth.uid(),'admin','Conversión de solicitud validada: condiciones pendientes, cobro bloqueado');
 result:=result||jsonb_build_array(rid);
 END LOOP;
 INSERT INTO public.event_enrollment_request_history(request_id,actor_user_id,action,from_status,to_status,review_note,details) VALUES(req.id,auth.uid(),'reservas_nativas_preparadas',req.status,req.status,trim(p_note),jsonb_build_object('reservations',result,'payment_enabled',false,'extra_night_interest',req.extra_night_interest));
 RETURN jsonb_build_object('ok',true,'duplicate',false,'reservations',result,'payment_enabled',false,'terms_pending',true);
END $$;
REVOKE ALL ON FUNCTION public.admin_prepare_trip_native_reservations(uuid,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_prepare_trip_native_reservations(uuid,text[],text) TO authenticated,service_role;