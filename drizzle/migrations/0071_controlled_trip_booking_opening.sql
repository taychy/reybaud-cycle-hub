CREATE TABLE public.event_booking_openings (
 event_id uuid PRIMARY KEY REFERENCES public.events(id),
 hotel_capacity integer, race_capacity integer,
 hotel_evidence text, race_evidence text,
 payment_url text, payment_verified boolean NOT NULL DEFAULT false,
 alps_event_id uuid REFERENCES public.events(id), alps_bike_package_ids uuid[] NOT NULL DEFAULT '{}',
 native_flow_verified boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT false,
 updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_booking_openings TO authenticated;
GRANT ALL ON public.event_booking_openings TO service_role;
ALTER TABLE public.event_booking_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_opening_admin_read ON public.event_booking_openings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE TABLE public.event_booking_opening_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.events(id),
 actor uuid NOT NULL, action text NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_booking_opening_log TO authenticated;
GRANT ALL ON public.event_booking_opening_log TO service_role;
ALTER TABLE public.event_booking_opening_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_opening_log_admin_read ON public.event_booking_opening_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
ALTER TABLE public.event_waitlist_entries ADD COLUMN converted_reservation_id uuid REFERENCES public.event_reservations(id);
ALTER TABLE public.event_waitlist_entries ADD COLUMN converted_at timestamptz;
ALTER TABLE public.event_waitlist_entries ADD COLUMN converted_by uuid;
CREATE UNIQUE INDEX booking_request_reservation_unique ON public.event_waitlist_entries(converted_reservation_id) WHERE converted_reservation_id IS NOT NULL;
-- Additive initialization only: closed, no capacity, no payment URL, no packages/plans activated.
INSERT INTO public.event_booking_openings(event_id)
 SELECT id FROM public.events WHERE id='78a739f4-9b06-47af-bc6d-d8a1705e2477';
CREATE OR REPLACE FUNCTION public.event_booking_opening_status(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.event_booking_openings%ROWTYPE; e public.events%ROWTYPE; blockers jsonb:='[]'; cap integer:=0; used integer:=0; opt jsonb; pkg record; plan record; snap jsonb; n integer;
BEGIN
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('controlled',false,'enabled',false,'ready',false,'available',0,'blockers','[]'::jsonb); END IF;
 SELECT * INTO e FROM events WHERE id=p_event_id;
 cap:=greatest(0,least(coalesce(c.hotel_capacity,0),coalesce(c.race_capacity,0)));
 IF cap=0 OR nullif(trim(c.hotel_evidence),'') IS NULL OR nullif(trim(c.race_evidence),'') IS NULL THEN blockers:=blockers||jsonb_build_array('Falta confirmar capacidad y respaldo de hotel y carrera.'); END IF;
 IF NOT c.payment_verified OR coalesce(c.payment_url,'') !~ '^https://[^/[:space:]]+/.+' OR c.payment_url IS DISTINCT FROM e.metadata->'payment_links'->>'deposit_url' OR coalesce(e.metadata->'payment_links'->>'deposit_currency','')<>'EUR' OR coalesce(e.metadata->'payment_links'->>'deposit_amount','')<>'500' THEN blockers:=blockers||jsonb_build_array('Falta un enlace propio de Maratona verificado para la seña de EUR 500.'); END IF;
 IF EXISTS(SELECT 1 FROM events x WHERE x.id<>p_event_id AND x.metadata->'payment_links'->>'deposit_url'=c.payment_url) THEN blockers:=blockers||jsonb_build_array('El enlace de pago pertenece también a otro evento; se requiere uno exclusivo.'); END IF;
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
 IF c.alps_event_id IS NULL OR NOT EXISTS(SELECT 1 FROM events WHERE id=c.alps_event_id AND id<>p_event_id) OR cardinality(c.alps_bike_package_ids)=0 OR EXISTS(SELECT 1 FROM unnest(c.alps_bike_package_ids) p WHERE NOT EXISTS(SELECT 1 FROM event_packages WHERE id=p AND event_id=c.alps_event_id)) THEN blockers:=blockers||jsonb_build_array('Falta vincular el viaje Alpes y verificar sus paquetes con alquiler de bicicleta.'); END IF;
 IF NOT c.native_flow_verified THEN blockers:=blockers||jsonb_build_array('Flujo nativo pendiente de despliegue autorizado y verificación; apertura bloqueada.'); END IF;
 SELECT count(*) INTO used FROM event_reservations WHERE event_id=p_event_id AND cancelled_at IS NULL AND reservation_status NOT IN ('cancelada','rechazada');
 IF used>cap THEN blockers:=blockers||jsonb_build_array('Las reservas exceden el pool global.'); END IF;
 RETURN jsonb_build_object('controlled',true,'enabled',c.enabled AND jsonb_array_length(blockers)=0,'ready',jsonb_array_length(blockers)=0,'capacity',cap,'available',greatest(cap-used,0),'deposit',500,'installments',8,'blockers',blockers);
END $$;
REVOKE ALL ON FUNCTION public.event_booking_opening_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_booking_opening_status(uuid) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_save_booking_opening(p_event_id uuid,p_input jsonb,p_enable boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_booking_openings%ROWTYPE; s jsonb; hotel integer; race integer; ids uuid[];
BEGIN
 IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento sin apertura controlada'; END IF;
 IF jsonb_typeof(p_input)<>'object' OR length(p_input::text)>6000 THEN RAISE EXCEPTION 'Configuración inválida'; END IF;
 hotel:=nullif(p_input->>'hotel_capacity','')::integer; race:=nullif(p_input->>'race_capacity','')::integer;
 IF coalesce(hotel,0)<0 OR coalesce(race,0)<0 OR coalesce(hotel,0)>10000 OR coalesce(race,0)>10000 THEN RAISE EXCEPTION 'Capacidad inválida'; END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(p_input->'alps_bike_package_ids','[]'));
 IF coalesce(p_input->>'payment_url','')<>'' AND p_input->>'payment_url' !~ '^https://[^/[:space:]]+/.+' THEN RAISE EXCEPTION 'El enlace de pago debe ser HTTPS'; END IF;
 UPDATE event_booking_openings SET hotel_capacity=hotel,race_capacity=race,hotel_evidence=nullif(trim(p_input->>'hotel_evidence'),''),race_evidence=nullif(trim(p_input->>'race_evidence'),''),payment_url=nullif(trim(p_input->>'payment_url'),''),payment_verified=coalesce((p_input->>'payment_verified')::boolean,false),alps_event_id=nullif(p_input->>'alps_event_id','')::uuid,alps_bike_package_ids=ids,enabled=false,updated_by=auth.uid(),updated_at=now() WHERE event_id=p_event_id;
 s:=event_booking_opening_status(p_event_id);
 IF p_enable THEN
  IF NOT (s->>'ready')::boolean OR (s->>'available')::integer<1 THEN RAISE EXCEPTION 'Apertura bloqueada: %',s->'blockers'; END IF;
  UPDATE event_booking_openings SET enabled=true WHERE event_id=p_event_id;
 END IF;
 INSERT INTO event_booking_opening_log(event_id,actor,action,detail) VALUES(p_event_id,auth.uid(),CASE WHEN p_enable THEN 'open' ELSE 'save_closed' END,p_input);
 RETURN event_booking_opening_status(p_event_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_save_booking_opening(uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_booking_opening(uuid,jsonb,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public._booking_alps_eligible(p_event_id uuid,p_package_id uuid,p_alumno_id uuid,p_email text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_booking_openings%ROWTYPE; opt jsonb;
BEGIN
 SELECT * INTO c FROM event_booking_openings WHERE event_id=p_event_id;
 SELECT value INTO opt FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'reservation_request'->'packages') WHERE e.id=p_event_id AND value->>'id'=p_package_id::text;
 IF opt IS NULL THEN RETURN false; END IF;
 IF opt->>'requires_alps'<>'true' THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id WHERE r.event_id=c.alps_event_id AND r.cancelled_at IS NULL AND r.reservation_status='reserva_confirmada' AND (r.alumno_id=p_alumno_id OR lower(trim(r.external_email))=lower(trim(p_email)) OR lower(trim(a.email))=lower(trim(p_email))) AND (opt->>'bike_included'<>'true' OR r.package_id=ANY(c.alps_bike_package_ids)));
END $$;
REVOKE ALL ON FUNCTION public._booking_alps_eligible(uuid,uuid,uuid,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.guard_controlled_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c event_booking_openings%ROWTYPE; s jsonb; mail text; plan record; pkg record; eligible boolean; deposit_paid numeric;
BEGIN
 IF TG_OP='UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id AND EXISTS(SELECT 1 FROM event_booking_openings WHERE event_id=OLD.event_id) THEN RAISE EXCEPTION 'No se puede mover una reserva de apertura controlada'; END IF;
 SELECT * INTO c FROM event_booking_openings WHERE event_id=NEW.event_id FOR UPDATE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND metadata->'reservation_request'->>'mode'='pending_no_payment') AND TG_OP='INSERT' THEN RAISE EXCEPTION 'Solo solicitudes sin pago hasta configurar apertura segura'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.alumno_id IS DISTINCT FROM OLD.alumno_id THEN RAISE EXCEPTION 'La identidad de esta reserva no puede reasignarse'; END IF;
 IF TG_OP='INSERT' OR NEW.package_id IS DISTINCT FROM OLD.package_id OR (TG_OP='UPDATE' AND OLD.reservation_status IN ('cancelada','rechazada') AND NEW.reservation_status NOT IN ('cancelada','rechazada')) THEN
  s:=event_booking_opening_status(NEW.event_id);
  IF NOT coalesce((s->>'enabled')::boolean,false) OR (s->>'available')::integer<1 THEN RAISE EXCEPTION 'Apertura de reservas bloqueada: %',s->'blockers'; END IF;
  SELECT lower(trim(email)) INTO mail FROM alumnos WHERE id=NEW.alumno_id;
  mail:=coalesce(nullif(lower(trim(NEW.external_email)),''),mail,(SELECT lower(trim(email)) FROM event_external_participants WHERE id=NEW.external_participant_id));
  IF mail IS NULL OR mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Email de titular inválido'; END IF;
  IF EXISTS(SELECT 1 FROM event_reservations r LEFT JOIN alumnos a ON a.id=r.alumno_id LEFT JOIN event_external_participants x ON x.id=r.external_participant_id WHERE r.event_id=NEW.event_id AND r.id<>NEW.id AND r.cancelled_at IS NULL AND r.reservation_status NOT IN ('cancelada','rechazada') AND (r.alumno_id=NEW.alumno_id OR lower(trim(coalesce(r.external_email,a.email,x.email)))=mail)) THEN RAISE EXCEPTION 'Ya existe una reserva para esta persona'; END IF;
  IF NOT _booking_alps_eligible(NEW.event_id,NEW.package_id,NEW.alumno_id,mail) THEN RAISE EXCEPTION 'La tarifa Alpes requiere reserva confirmada y alquiler verificado cuando corresponde'; END IF;
  SELECT * INTO pkg FROM event_packages WHERE id=NEW.package_id AND event_id=NEW.event_id AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paquete no disponible'; END IF;
  SELECT * INTO plan FROM event_package_payment_plans WHERE package_id=pkg.id AND activo AND archived_at IS NULL AND price_stage_id IS NULL;
  NEW.external_email:=mail; NEW.amount_total:=pkg.precio; NEW.price_snapshot:=pkg.precio; NEW.monto:=pkg.precio; NEW.currency_snapshot:='EUR'; NEW.moneda:='EUR'; NEW.package_nombre_snapshot:=pkg.nombre;
  NEW.payment_plan_id:=plan.id; NEW.payment_plan_name_snapshot:=plan.nombre; NEW.payment_plan_snapshot:=build_payment_plan_snapshot(plan.id,pkg.precio,current_date);
  IF TG_OP='INSERT' THEN
   IF NEW.metodo_pago IN ('mp','mercado_pago') THEN RAISE EXCEPTION 'Mercado Pago en EUR no está habilitado'; END IF;
   NEW.reservation_status:='solicitud_enviada'; NEW.estado:='solicitud_enviada'; NEW.payment_status:='no_informado'; NEW.amount_paid:=0; NEW.balance_due:=pkg.precio; NEW.confirmed_at:=NULL;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.reservation_status='reserva_confirmada' OR NEW.confirmed_at IS NOT NULL) AND (NEW.reservation_status IS DISTINCT FROM OLD.reservation_status OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) THEN
  IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'admin'::app_role) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Confirmación solo por Administración'; END IF;
  IF NEW.terminos_pendientes OR NEW.terminos_aceptados_at IS NULL THEN RAISE EXCEPTION 'Condiciones pendientes de aceptación'; END IF;
  SELECT coalesce(sum(coalesce(p.obligation_amount_contract,p.equivalent_amount_event_currency,p.amount)),0) INTO deposit_paid FROM reservation_payments p WHERE p.reservation_id=NEW.id AND p.status='validado' AND p.anulado_at IS NULL AND (p.currency='EUR' OR p.event_currency='EUR');
  IF deposit_paid<500 THEN RAISE EXCEPTION 'La seña EUR 500 debe estar acreditada y validada antes de confirmar'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zzzz_guard_controlled_booking BEFORE INSERT OR UPDATE ON public.event_reservations FOR EACH ROW EXECUTE FUNCTION public.guard_controlled_booking();
CREATE OR REPLACE FUNCTION public.materialize_controlled_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM event_booking_openings WHERE event_id=NEW.event_id) THEN
  IF public.materialize_reservation_installments(NEW.id)<>9 THEN RAISE EXCEPTION 'Se requieren seña y ocho cuotas materializadas en la misma transacción'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zzzz_materialize_controlled_booking AFTER INSERT ON public.event_reservations FOR EACH ROW EXECUTE FUNCTION public.materialize_controlled_booking();
CREATE OR REPLACE FUNCTION public.guard_booking_request_conversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.origen='solicitud_reserva_sin_pago' AND (NEW.estado='convertido' OR NEW.converted_reservation_id IS DISTINCT FROM OLD.converted_reservation_id) AND current_setting('app.booking_conversion',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Usá Continuar reserva: el cambio de estado no crea una reserva'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zzzz_guard_booking_request_conversion BEFORE UPDATE ON public.event_waitlist_entries FOR EACH ROW EXECUTE FUNCTION public.guard_booking_request_conversion();