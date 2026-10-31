CREATE OR REPLACE FUNCTION public._trip_food_stay(p_reservation_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.event_reservations%ROWTYPE; q public.reservation_rescheduling_requests%ROWTYPE; s text; f text; d date; z date;
BEGIN
SELECT * INTO r FROM public.event_reservations WHERE id=p_reservation_id; IF NOT FOUND OR r.reservation_status IN ('cancelada','rechazada') THEN RETURN NULL; END IF;
SELECT * INTO q FROM public.reservation_rescheduling_requests WHERE reservation_id=r.id AND event_id=r.event_id;
IF FOUND THEN
 IF q.review_status<>'validada' OR q.snapshot#>>'{option,value}' IS DISTINCT FROM q.choice THEN RETURN NULL; END IF;
 s:=q.snapshot#>>'{option,start}'; f:=q.snapshot#>>'{option,end}';
ELSE
 IF EXISTS(SELECT 1 FROM public.event_rescheduling_campaigns WHERE event_id=r.event_id) THEN RETURN NULL; END IF;
 SELECT date::text,end_date::text INTO s,f FROM public.events WHERE id=r.event_id;
END IF;
IF s IS NULL OR f IS NULL OR s !~ '^\d{4}-\d{2}-\d{2}$' OR f !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
BEGIN d:=s::date; z:=f::date; EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
IF d>z THEN RETURN NULL; END IF;
RETURN jsonb_build_object('start',s,'end',f);
END $$;
REVOKE ALL ON FUNCTION public._trip_food_stay(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_trip_food_stay(p_reservation_id uuid,p_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.event_reservations%ROWTYPE;
BEGIN
SELECT * INTO r FROM public.event_reservations WHERE id=p_reservation_id;
IF NOT FOUND OR NOT (COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) OR (auth.uid() IS NOT NULL AND r.alumno_id IS NOT NULL AND r.alumno_id=public.current_alumno_id()) OR (p_token IS NOT NULL AND length(p_token)>0 AND r.access_token=p_token)) THEN RAISE EXCEPTION 'No autorizado'; END IF;
RETURN public._trip_food_stay(r.id);
END $$;
REVOKE ALL ON FUNCTION public.get_trip_food_stay(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_food_stay(uuid,text) TO authenticated,anon;
CREATE OR REPLACE FUNCTION public.trip_food_survey_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 _included boolean:=false; _status text; _meta jsonb; _event uuid; _pkg uuid; _stay jsonb;
 _old jsonb:=CASE WHEN TG_OP='UPDATE' THEN COALESCE(OLD.data,'{}'::jsonb) ELSE '{}'::jsonb END;
 _d jsonb:=COALESCE(NEW.data,'{}'::jsonb); _is_admin boolean:=COALESCE(public.has_role(auth.uid(),'admin'::app_role),false);
 _tipo text; _alerg text; _meals jsonb:='[]'::jsonb; _old_meals jsonb:=COALESCE(_old->'comidas_solicitadas','[]'::jsonb);
BEGIN
IF NEW.step_key<>'gastronomia' THEN RETURN NEW; END IF;
SELECT COALESCE(p.incluye_gastronomia,false),r.reservation_status,e.metadata,r.package_id,r.event_id INTO _included,_status,_meta,_pkg,_event
FROM public.event_reservations r LEFT JOIN public.event_packages p ON p.id=r.package_id AND p.event_id=r.event_id LEFT JOIN public.events e ON e.id=r.event_id WHERE r.id=NEW.reservation_id;
IF NOT FOUND THEN RAISE EXCEPTION 'reserva_no_encontrada'; END IF;
IF NOT _is_admin AND _status IN ('cancelada','rechazada') THEN RAISE EXCEPTION 'reserva_no_activa'; END IF;
_tipo:=_d->>'tipo_alimentacion'; IF _tipo IS NOT NULL AND _tipo NOT IN ('normal','vegetariana','vegana','otra') THEN RAISE EXCEPTION 'tipo_alimentacion_invalido'; END IF;
_alerg:=_d->>'tiene_alergias'; IF _alerg IS NOT NULL AND _alerg NOT IN ('true','false') THEN RAISE EXCEPTION 'tiene_alergias_invalido'; END IF;
_stay:=public._trip_food_stay(NEW.reservation_id);
IF NOT _included AND _pkg IS NOT NULL AND _stay IS NOT NULL AND jsonb_typeof(_d->'comidas_solicitadas')='array' THEN
 SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('fecha',m->>'fecha','tipo',m->>'tipo')),'[]'::jsonb) INTO _meals
 FROM jsonb_array_elements(_d->'comidas_solicitadas') m
 WHERE m->>'tipo' IN ('almuerzo','cena') AND m->>'fecha' BETWEEN _stay->>'start' AND _stay->>'end'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_meta#>'{food_survey,meal_program,meals}')='array' THEN _meta#>'{food_survey,meal_program,meals}' ELSE '[]'::jsonb END) pm
 WHERE pm->>'fecha'=m->>'fecha' AND pm->>'tipo'=m->>'tipo' AND (jsonb_typeof(pm->'package_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(pm->'package_ids')=0 OR pm->'package_ids' ? _pkg::text))
 AND EXISTS(SELECT 1 FROM public.event_addons a WHERE a.id::text=_meta#>>ARRAY['food_survey','meal_program',(m->>'tipo')||'_addon_id'] AND a.event_id=_event AND a.activo AND a.precio>0 AND (a.aplica_a_paquetes IS NULL OR cardinality(a.aplica_a_paquetes)=0 OR _pkg=ANY(a.aplica_a_paquetes)))
 AND NOT EXISTS(SELECT 1 FROM public.reservation_addons ra JOIN public.event_addons ca ON ca.id=ra.addon_id AND ca.event_id=_event
 WHERE ra.reservation_id=NEW.reservation_id AND ra.addon_id::text=_meta#>>ARRAY['food_survey','meal_program',(m->>'tipo')||'_addon_id']
 AND ((COALESCE(ra.notas,'') !~ '\d{4}-\d{2}-\d{2}') OR (m->>'fecha')=ANY(regexp_split_to_array(regexp_replace(COALESCE(ra.notas,''),'[^0-9-]+',' ','g'),'\s+'))));
END IF;
_d:=_d||jsonb_build_object('pension_incluida',_included,'pension_interes',false,'comidas_solicitadas',_meals,'respondido_at',COALESCE(_old->>'respondido_at',to_jsonb(now())#>>'{}'),'actualizado_at',to_jsonb(now())#>>'{}','version',4);
IF _meals<>_old_meals THEN _d:=_d||jsonb_build_object('comidas_solicitadas_at',to_jsonb(now())#>>'{}'); ELSIF _old ? 'comidas_solicitadas_at' THEN _d:=_d||jsonb_build_object('comidas_solicitadas_at',_old->'comidas_solicitadas_at'); END IF;
IF NOT _is_admin THEN _d:=_d-'pension_gestion'-'pension_gestion_at'; IF _old ? 'pension_gestion' THEN _d:=_d||jsonb_build_object('pension_gestion',_old->'pension_gestion','pension_gestion_at',_old->'pension_gestion_at'); END IF; END IF;
NEW.data:=_d; NEW.completed:=(_tipo IS NOT NULL AND _alerg IS NOT NULL); NEW.updated_at:=now(); RETURN NEW;
END $$;
COMMENT ON FUNCTION public._trip_food_stay(uuid) IS 'Food-only literal stay bounds from validated rescheduling snapshot; unresolved rescheduling never falls back to historic dates. No calendar generated or reservation changed.';