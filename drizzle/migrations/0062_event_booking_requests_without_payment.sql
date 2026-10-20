CREATE OR REPLACE FUNCTION public.event_booking_request_options(p_event_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT jsonb_build_object('enabled',true,'packages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.nombre,'price',p.precio,'currency',p.currency,'bike_included',o.value->'bike_included','requires_alps',o.value->'requires_alps') ORDER BY p.sort_order) FROM jsonb_array_elements(e.metadata->'reservation_request'->'packages') o JOIN public.event_packages p ON p.id=(o.value->>'id')::uuid AND p.event_id=e.id),'[]')) FROM public.events e WHERE e.id=p_event_id AND e.is_active AND e.estado_publicacion='publicado' AND e.metadata->'reservation_request'->>'mode'='pending_no_payment';
$$;
REVOKE ALL ON FUNCTION public.event_booking_request_options(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_booking_request_options(uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.validate_event_booking_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record;p record;opt jsonb; BEGIN
SELECT metadata,waitlist_habilitada,is_active,estado_publicacion INTO e FROM public.events WHERE id=NEW.event_id;
IF e.metadata->'reservation_request'->>'mode' IS DISTINCT FROM 'pending_no_payment' THEN RETURN NEW; END IF;
IF TG_OP='UPDATE' THEN
 IF public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Solicitud ya registrada. Contactá a Administración para modificarla';
END IF;
IF NOT e.waitlist_habilitada OR NOT e.is_active OR e.estado_publicacion<>'publicado' THEN RAISE EXCEPTION 'Solicitudes no habilitadas'; END IF;
IF length(trim(NEW.nombre)) NOT BETWEEN 2 AND 100 OR length(NEW.email)>255 OR NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(coalesce(NEW.telefono,'')) NOT BETWEEN 6 AND 30 OR NEW.telefono !~ '^[+0-9() .-]+$' OR jsonb_typeof(NEW.respuestas)<>'object' OR length(NEW.respuestas::text)>3000 THEN RAISE EXCEPTION 'Contacto inválido'; END IF;
IF NEW.respuestas->>'contact_consent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Autorizá el contacto para esta solicitud'; END IF;
SELECT value INTO opt FROM jsonb_array_elements(e.metadata->'reservation_request'->'packages') WHERE value->>'id'=NEW.respuestas->>'package_id';
IF opt IS NULL THEN RAISE EXCEPTION 'Paquete no disponible para solicitudes'; END IF;
SELECT * INTO p FROM public.event_packages WHERE id=(opt->>'id')::uuid AND event_id=NEW.event_id AND currency='EUR' AND personas_por_habitacion=2;
IF NOT FOUND THEN RAISE EXCEPTION 'Paquete inválido'; END IF;
IF opt->>'requires_alps'='true' AND NEW.respuestas->>'alps_acknowledged' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Tarifa Alpes pendiente de verificación administrativa'; END IF;
IF opt->>'requires_alps'='true' AND opt->>'bike_included'='true' AND NEW.respuestas->>'both_rentals_acknowledged' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'La bonificación requiere alquiler en ambos viajes'; END IF;
NEW.alumno_id:=NULL;
IF auth.uid() IS NOT NULL THEN SELECT id INTO NEW.alumno_id FROM public.alumnos WHERE user_id=auth.uid() AND lower(email)=lower(NEW.email) LIMIT 1; END IF;
NEW.nombre:=trim(NEW.nombre);NEW.email:=lower(trim(NEW.email));NEW.origen:='solicitud_reserva_sin_pago';NEW.estado:='nuevo';NEW.admin_notas:=NULL;NEW.contactado_por:=NULL;NEW.contactado_at:=NULL;NEW.dni:=NULL;
NEW.respuestas:=jsonb_build_object('package_id',p.id,'package_name',p.nombre,'price_eur',p.precio,'bike_included',opt->'bike_included','requires_alps',opt->'requires_alps','eligibility',CASE WHEN opt->>'requires_alps'='true' THEN 'Pendiente de validación Alpes' ELSE 'No requiere Alpes' END,'room','Doble · asignación pendiente','contact_consent',true,'alps_acknowledged',NEW.respuestas->'alps_acknowledged','both_rentals_acknowledged',NEW.respuestas->'both_rentals_acknowledged','note',left(coalesce(NEW.respuestas->>'note',''),1000),'status','Solicitud pendiente · sin plaza confirmada ni cobro');
RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_event_booking_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER event_booking_request_validation BEFORE INSERT OR UPDATE ON public.event_waitlist_entries FOR EACH ROW EXECUTE FUNCTION public.validate_event_booking_request();
CREATE OR REPLACE FUNCTION public.submit_event_booking_request(p_event_id uuid,p_package_id uuid,p_nombre text,p_email text,p_telefono text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR length(p_input::text)>2000 THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.events WHERE id=p_event_id AND metadata->'reservation_request'->>'mode'='pending_no_payment') THEN RAISE EXCEPTION 'Solicitudes no habilitadas'; END IF;
INSERT INTO public.event_waitlist_entries(event_id,nombre,email,telefono,respuestas) VALUES(p_event_id,p_nombre,lower(trim(p_email)),p_telefono,p_input||jsonb_build_object('package_id',p_package_id)) ON CONFLICT(event_id,lower(email)) DO NOTHING;
RETURN jsonb_build_object('ok',true,'status','pending_no_payment');
END $$;
REVOKE ALL ON FUNCTION public.submit_event_booking_request(uuid,uuid,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_event_booking_request(uuid,uuid,text,text,text,jsonb) TO anon,authenticated;