CREATE OR REPLACE FUNCTION public.admin_set_food_survey_enabled(p_event uuid,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE m jsonb; fs jsonb;
BEGIN
IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN RAISE EXCEPTION 'No autorizado'; END IF;
SELECT COALESCE(metadata,'{}'::jsonb) INTO m FROM public.events WHERE id=p_event FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'evento_no_encontrado'; END IF;
fs:=COALESCE(m->'food_survey','{}'::jsonb);
fs:=fs||jsonb_build_object('enabled',p_enabled,'publication_mode',CASE WHEN p_enabled THEN 'preferencias_activas' ELSE 'inactiva' END,'meals_enabled',COALESCE((fs->>'meals_enabled')::boolean,false),'history',COALESCE(fs->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'by',auth.uid(),'action',CASE WHEN p_enabled THEN 'enable_preferences' ELSE 'disable_preferences' END)));
UPDATE public.events SET metadata=jsonb_set(m,'{food_survey}',fs,true) WHERE id=p_event; RETURN fs;
END $f$;
CREATE OR REPLACE FUNCTION public.admin_enable_food_meals(p_event uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE m jsonb; fs jsonb; b jsonb; d date; t text; st text; ids uuid[]:='{}'; aid uuid;
BEGIN
IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN RAISE EXCEPTION 'No autorizado'; END IF;
SELECT COALESCE(metadata,'{}'::jsonb) INTO m FROM public.events WHERE id=p_event FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'evento_no_encontrado'; END IF;
fs:=COALESCE(m->'food_survey','{}'::jsonb); IF NOT COALESCE((fs->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'encuesta_no_habilitada'; END IF;
b:=public._food_program_bounds(p_event); IF b IS NULL THEN RAISE EXCEPTION 'sin_estadias_validadas'; END IF;
FOR d IN SELECT generate_series((b->>'start')::date,(b->>'end')::date,'1 day')::date LOOP
FOREACH t IN ARRAY ARRAY['almuerzo','cena'] LOOP
SELECT c->>'estado' INTO st FROM jsonb_array_elements(COALESCE(fs->'calendar','[]'::jsonb)) c WHERE c->>'fecha'=d::text AND c->>'tipo'=t;
IF st IS NULL OR st NOT IN ('activo','inactivo') THEN RAISE EXCEPTION 'servicio_sin_decidir: % %',d,t; END IF;
IF st='activo' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(fs#>'{meal_program,meals}','[]'::jsonb)) q WHERE q->>'fecha'=d::text AND q->>'tipo'=t) THEN RAISE EXCEPTION 'programa_inconsistente'; END IF;
END LOOP; END LOOP;
FOREACH t IN ARRAY ARRAY['almuerzo','cena'] LOOP
IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(fs#>'{meal_program,meals}','[]'::jsonb)) q WHERE q->>'tipo'=t) THEN
SELECT id INTO aid FROM public.event_addons WHERE id::text=fs#>>ARRAY['meal_program',t||'_addon_id'] AND event_id=p_event AND precio>0 AND categoria='comida_regular';
IF aid IS NULL THEN RAISE EXCEPTION 'extra_regular_faltante'; END IF; ids:=ids||aid;
END IF; END LOOP;
UPDATE public.event_addons SET activo=true,updated_at=now() WHERE id=ANY(ids) AND NOT activo;
fs:=fs||jsonb_build_object('meals_enabled',true,'publication_mode','comidas_activas','history',COALESCE(fs->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'by',auth.uid(),'action','enable_meals')));
UPDATE public.events SET metadata=jsonb_set(m,'{food_survey}',fs,true) WHERE id=p_event; RETURN fs;
END $f$;
CREATE OR REPLACE FUNCTION public.trip_food_survey_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE inc boolean:=false; st text; meta jsonb; ev uuid; pkg uuid; stay jsonb;
old_d jsonb:=CASE WHEN TG_OP='UPDATE' THEN COALESCE(OLD.data,'{}'::jsonb) ELSE '{}'::jsonb END;
d jsonb:=COALESCE(NEW.data,'{}'::jsonb); adm boolean:=COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false);
tipo text; alerg text; meals jsonb:='[]'; old_meals jsonb:=COALESCE(old_d->'comidas_solicitadas','[]'::jsonb);
BEGIN
IF NEW.step_key<>'gastronomia' THEN RETURN NEW; END IF;
SELECT COALESCE(p.incluye_gastronomia,false),r.reservation_status,e.metadata,r.package_id,r.event_id INTO inc,st,meta,pkg,ev FROM public.event_reservations r LEFT JOIN public.event_packages p ON p.id=r.package_id AND p.event_id=r.event_id LEFT JOIN public.events e ON e.id=r.event_id WHERE r.id=NEW.reservation_id FOR SHARE OF r;
IF NOT FOUND THEN RAISE EXCEPTION 'reserva_no_encontrada'; END IF;
IF st IS DISTINCT FROM 'reserva_confirmada' THEN RAISE EXCEPTION 'reserva_no_activa'; END IF;
IF NOT COALESCE((meta#>>'{food_survey,enabled}')::boolean,false) AND NOT adm THEN RAISE EXCEPTION 'encuesta_no_habilitada'; END IF;
IF auth.uid() IS NOT NULL AND NOT adm AND NOT EXISTS(SELECT 1 FROM public.event_reservations r WHERE r.id=NEW.reservation_id AND r.alumno_id=public.current_alumno_id() AND NEW.alumno_id=r.alumno_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
IF d->>'comidas_interes_modo' IS NOT NULL AND d->>'comidas_interes_modo' NOT IN ('todas','individual','ninguna') THEN RAISE EXCEPTION 'comidas_interes_modo_invalido'; END IF;
IF inc THEN d:=d||jsonb_build_object('comidas_interes_modo',NULL); END IF;
tipo:=d->>'tipo_alimentacion'; IF tipo IS NOT NULL AND tipo NOT IN ('normal','vegetariana','vegana','otra') THEN RAISE EXCEPTION 'tipo_alimentacion_invalido'; END IF;
alerg:=d->>'tiene_alergias'; IF alerg IS NOT NULL AND alerg NOT IN ('true','false') THEN RAISE EXCEPTION 'tiene_alergias_invalido'; END IF;
stay:=public._trip_food_stay(NEW.reservation_id);
IF COALESCE((meta#>>'{food_survey,meals_enabled}')::boolean,true) AND NOT inc AND pkg IS NOT NULL AND stay IS NOT NULL AND jsonb_typeof(d->'comidas_solicitadas')='array' THEN
SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('fecha',q->>'fecha','tipo',q->>'tipo')),'[]'::jsonb) INTO meals FROM jsonb_array_elements(d->'comidas_solicitadas') q
WHERE q->>'tipo' IN ('almuerzo','cena') AND q->>'fecha' BETWEEN stay->>'start' AND stay->>'end'
AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(meta#>'{food_survey,meal_program,meals}')='array' THEN meta#>'{food_survey,meal_program,meals}' ELSE '[]'::jsonb END) pm WHERE pm->>'fecha'=q->>'fecha' AND pm->>'tipo'=q->>'tipo' AND (jsonb_typeof(pm->'package_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(pm->'package_ids')=0 OR pm->'package_ids' ? pkg::text))
AND EXISTS(SELECT 1 FROM public.event_addons a WHERE a.id::text=meta#>>ARRAY['food_survey','meal_program',(q->>'tipo')||'_addon_id'] AND a.event_id=ev AND a.activo AND a.precio>0 AND a.categoria='comida_regular' AND (a.aplica_a_paquetes IS NULL OR cardinality(a.aplica_a_paquetes)=0 OR pkg=ANY(a.aplica_a_paquetes)))
AND NOT EXISTS(SELECT 1 FROM public.reservation_addons ra JOIN public.event_addons ca ON ca.id=ra.addon_id AND ca.event_id=ev WHERE ra.reservation_id=NEW.reservation_id AND ra.addon_id::text=meta#>>ARRAY['food_survey','meal_program',(q->>'tipo')||'_addon_id'] AND (COALESCE(ra.notas,'') !~ '\d{4}-\d{2}-\d{2}' OR (q->>'fecha')=ANY(regexp_split_to_array(regexp_replace(COALESCE(ra.notas,''),'[^0-9-]+',' ','g'),'\s+'))));
END IF;
d:=d||jsonb_build_object('pension_incluida',inc,'pension_interes',false,'comidas_solicitadas',meals,'respondido_at',COALESCE(old_d->>'respondido_at',to_jsonb(now())#>>'{}'),'actualizado_at',to_jsonb(now())#>>'{}','version',5);
IF meals<>old_meals THEN d:=d||jsonb_build_object('comidas_solicitadas_at',now()); ELSIF old_d ? 'comidas_solicitadas_at' THEN d:=d||jsonb_build_object('comidas_solicitadas_at',old_d->'comidas_solicitadas_at'); END IF;
IF NOT adm THEN d:=d-'pension_gestion'-'pension_gestion_at'; IF old_d ? 'pension_gestion' THEN d:=d||jsonb_build_object('pension_gestion',old_d->'pension_gestion','pension_gestion_at',old_d->'pension_gestion_at'); END IF; END IF;
NEW.data:=d; NEW.completed:=(tipo IS NOT NULL AND alerg IS NOT NULL); NEW.updated_at:=now(); RETURN NEW;
END $f$;
CREATE OR REPLACE FUNCTION public.get_my_trip_food_survey(p_event uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $f$
DECLARE ids uuid[]; r public.event_reservations%ROWTYPE; e public.events%ROWTYPE;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
SELECT array_agg(id) INTO ids FROM public.event_reservations WHERE event_id=p_event AND alumno_id=public.current_alumno_id() AND reservation_status='reserva_confirmada';
IF COALESCE(cardinality(ids),0)<>1 THEN RETURN NULL; END IF;
SELECT * INTO r FROM public.event_reservations WHERE id=ids[1]; SELECT * INTO e FROM public.events WHERE id=p_event;
IF NOT COALESCE((e.metadata#>>'{food_survey,enabled}')::boolean,false) THEN RETURN NULL; END IF;
RETURN jsonb_build_object('reservation',jsonb_build_object('id',r.id,'alumno_id',r.alumno_id),'event',jsonb_build_object('title',e.title,'metadata',jsonb_build_object('food_survey',e.metadata->'food_survey')));
END $f$;
REVOKE ALL ON FUNCTION public.get_my_trip_food_survey(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_trip_food_survey(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_enable_food_meals(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_enable_food_meals(uuid) TO authenticated,service_role;