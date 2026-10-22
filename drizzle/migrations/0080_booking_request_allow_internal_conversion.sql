CREATE OR REPLACE FUNCTION public.validate_event_booking_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e record;p record;opt jsonb; BEGIN
SELECT metadata,waitlist_habilitada,is_active,estado_publicacion INTO e FROM public.events WHERE id=NEW.event_id;
IF e.metadata->'reservation_request'->>'mode' IS DISTINCT FROM 'pending_no_payment' THEN RETURN NEW; END IF;
IF TG_OP='UPDATE' THEN
 IF public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN NEW; END IF;
 -- Internal conversion (crosssell_book): only conversion fields may change.
 IF current_setting('app.booking_conversion',true)='on'
    AND (to_jsonb(NEW)-ARRAY['converted_reservation_id','converted_at','converted_by','estado','updated_at'])=(to_jsonb(OLD)-ARRAY['converted_reservation_id','converted_at','converted_by','estado','updated_at'])
    AND NEW.estado='convertido' AND OLD.converted_reservation_id IS NULL THEN RETURN NEW; END IF;
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
END $function$;