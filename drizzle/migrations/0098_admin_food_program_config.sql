CREATE OR REPLACE FUNCTION public._food_program_bounds(p_event uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s text; f text;
BEGIN
IF EXISTS(SELECT 1 FROM public.event_rescheduling_campaigns WHERE event_id=p_event) THEN
 SELECT min(q.snapshot#>>'{option,start}'),max(q.snapshot#>>'{option,end}') INTO s,f
 FROM public.reservation_rescheduling_requests q JOIN public.event_reservations r ON r.id=q.reservation_id
 WHERE q.event_id=p_event AND q.review_status='validada' AND q.snapshot#>>'{option,value}'=q.choice
 AND r.reservation_status NOT IN ('cancelada','rechazada') AND q.snapshot#>>'{option,start}' ~ '^\d{4}-\d{2}-\d{2}$' AND q.snapshot#>>'{option,end}' ~ '^\d{4}-\d{2}-\d{2}$';
ELSE SELECT date::text,end_date::text INTO s,f FROM public.events WHERE id=p_event; END IF;
IF s IS NULL OR f IS NULL THEN RETURN NULL; END IF;
RETURN jsonb_build_object('start',s,'end',f);
END $$;
REVOKE ALL ON FUNCTION public._food_program_bounds(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_food_program_status(p_event uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.events%ROWTYPE; _stays jsonb; _pending int; _camp boolean;
BEGIN
IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN RAISE EXCEPTION 'No autorizado'; END IF;
SELECT * INTO e FROM public.events WHERE id=p_event; IF NOT FOUND THEN RAISE EXCEPTION 'evento_no_encontrado'; END IF;
_camp:=EXISTS(SELECT 1 FROM public.event_rescheduling_campaigns WHERE event_id=p_event);
SELECT COALESCE(jsonb_agg(x ORDER BY x->>'start',x->>'end'),'[]'::jsonb) INTO _stays FROM (
 SELECT jsonb_build_object('choice',q.choice,'start',q.snapshot#>>'{option,start}','end',q.snapshot#>>'{option,end}','reservas',count(*),
  'con_pension',count(*) FILTER (WHERE COALESCE(p.incluye_gastronomia,false)),'sin_pension',count(*) FILTER (WHERE NOT COALESCE(p.incluye_gastronomia,false))) x
 FROM public.reservation_rescheduling_requests q JOIN public.event_reservations r ON r.id=q.reservation_id LEFT JOIN public.event_packages p ON p.id=r.package_id
 WHERE q.event_id=p_event AND q.review_status='validada' AND q.snapshot#>>'{option,value}'=q.choice AND r.reservation_status NOT IN ('cancelada','rechazada') AND q.snapshot#>>'{option,start}' IS NOT NULL
 GROUP BY q.choice,q.snapshot#>>'{option,start}',q.snapshot#>>'{option,end}') t;
SELECT count(*) INTO _pending FROM public.reservation_rescheduling_requests q JOIN public.event_reservations r ON r.id=q.reservation_id
 WHERE q.event_id=p_event AND q.review_status<>'validada' AND r.reservation_status NOT IN ('cancelada','rechazada');
RETURN jsonb_build_object('event_date',e.date,'event_end_date',e.end_date,'has_campaign',_camp,'bounds',public._food_program_bounds(p_event),
 'stays',_stays,'pending_requests',_pending,
 'sin_estadia',(SELECT count(*) FROM public.event_reservations r WHERE r.event_id=p_event AND r.reservation_status NOT IN ('cancelada','rechazada') AND public._trip_food_stay(r.id) IS NULL),
 'food_survey',COALESCE(e.metadata->'food_survey','null'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_food_program_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_food_program_status(uuid) TO authenticated;

-- Creates/associates the two regular meal Extras (inactive draft); never touches special dinners.
CREATE OR REPLACE FUNCTION public.admin_food_program_ensure_addons(p_event uuid, p_precio numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _meta jsonb; _fs jsonb; _ids jsonb:='{}'::jsonb; t text; _id uuid; _cur text;
BEGIN
IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN RAISE EXCEPTION 'No autorizado'; END IF;
IF p_precio IS NULL OR p_precio<=0 THEN RAISE EXCEPTION 'precio_invalido'; END IF;
SELECT COALESCE(metadata,'{}'::jsonb) INTO _meta FROM public.events WHERE id=p_event FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'evento_no_encontrado'; END IF;
_fs:=COALESCE(_meta->'food_survey','{}'::jsonb);
FOREACH t IN ARRAY ARRAY['almuerzo','cena'] LOOP
 _cur:=_fs#>>ARRAY['meal_program',t||'_addon_id']; _id:=NULL;
 IF _cur IS NOT NULL THEN SELECT id INTO _id FROM public.event_addons WHERE id::text=_cur AND event_id=p_event; END IF;
 IF _id IS NULL THEN SELECT id INTO _id FROM public.event_addons WHERE event_id=p_event AND categoria='comida_regular' AND nombre=CASE t WHEN 'almuerzo' THEN 'Almuerzo regular' ELSE 'Cena regular' END ORDER BY created_at LIMIT 1; END IF;
 IF _id IS NULL THEN
  INSERT INTO public.event_addons(event_id,nombre,descripcion,precio,currency,tipo,max_por_participante,activo,categoria,sort_order)
  VALUES(p_event,CASE t WHEN 'almuerzo' THEN 'Almuerzo regular' ELSE 'Cena regular' END,'Comida regular del programa gastronómico, por servicio y fecha. No incluye desayuno (incluido por alojamiento).',p_precio,'ARS','opcional',NULL,false,'comida_regular',900)
  RETURNING id INTO _id;
 END IF;
 _ids:=_ids||jsonb_build_object(t||'_addon_id',_id::text);
END LOOP;
_fs:=jsonb_set(_fs,'{meal_program}',COALESCE(_fs->'meal_program','{"meals":[]}'::jsonb)||_ids,true);
_fs:=_fs||jsonb_build_object('enabled',COALESCE((_fs->>'enabled')::boolean,false),'history',COALESCE(_fs->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'by',auth.uid(),'action','ensure_addons','ids',_ids)));
UPDATE public.events SET metadata=jsonb_set(_meta,'{food_survey}',_fs,true) WHERE id=p_event;
RETURN _ids;
END $$;
REVOKE ALL ON FUNCTION public.admin_food_program_ensure_addons(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_food_program_ensure_addons(uuid,numeric) TO authenticated;

-- Saves the calendar (activo/inactivo/pendiente). Only 'activo' slots become offerable meals.
CREATE OR REPLACE FUNCTION public.admin_save_food_program(p_event uuid, p_calendar jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _meta jsonb; _fs jsonb; _b jsonb; c jsonb; _cal jsonb:='[]'::jsonb; _meals jsonb:='[]'::jsonb; _seen text[]:='{}'; k text;
BEGIN
IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN RAISE EXCEPTION 'No autorizado'; END IF;
IF jsonb_typeof(p_calendar)<>'array' THEN RAISE EXCEPTION 'calendario_invalido'; END IF;
SELECT COALESCE(metadata,'{}'::jsonb) INTO _meta FROM public.events WHERE id=p_event FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'evento_no_encontrado'; END IF;
_b:=public._food_program_bounds(p_event); IF _b IS NULL THEN RAISE EXCEPTION 'sin_estadias_validadas'; END IF;
FOR c IN SELECT * FROM jsonb_array_elements(p_calendar) LOOP
 IF c->>'fecha' !~ '^\d{4}-\d{2}-\d{2}$' OR c->>'tipo' NOT IN ('almuerzo','cena') OR c->>'estado' NOT IN ('activo','inactivo','pendiente') THEN RAISE EXCEPTION 'entrada_invalida: %',c; END IF;
 IF c->>'fecha' < _b->>'start' OR c->>'fecha' > _b->>'end' THEN RAISE EXCEPTION 'fecha_fuera_de_estadias: %',c->>'fecha'; END IF;
 k:=(c->>'fecha')||'|'||(c->>'tipo'); IF k=ANY(_seen) THEN RAISE EXCEPTION 'duplicado: %',k; END IF; _seen:=_seen||k;
 _cal:=_cal||jsonb_build_array(jsonb_build_object('fecha',c->>'fecha','tipo',c->>'tipo','estado',c->>'estado'));
 IF c->>'estado'='activo' THEN _meals:=_meals||jsonb_build_array(jsonb_build_object('fecha',c->>'fecha','tipo',c->>'tipo')); END IF;
END LOOP;
_fs:=COALESCE(_meta->'food_survey','{}'::jsonb);
_fs:=jsonb_set(_fs,'{meal_program}',COALESCE(_fs->'meal_program','{}'::jsonb)||jsonb_build_object('meals',_meals),true);
_fs:=_fs||jsonb_build_object('calendar',_cal,'enabled',COALESCE((_fs->>'enabled')::boolean,false),
 'history',COALESCE(_fs->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'by',auth.uid(),'action','save_calendar','activos',jsonb_array_length(_meals))));
UPDATE public.events SET metadata=jsonb_set(_meta,'{food_survey}',_fs,true) WHERE id=p_event;
RETURN _fs;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_food_program(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_food_program(uuid,jsonb) TO authenticated;

-- Enable only with complete decided calendar and valid same-event Extras; disabling never touches Extras or purchases.
CREATE OR REPLACE FUNCTION public.admin_set_food_survey_enabled(p_event uuid, p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _meta jsonb; _fs jsonb; _b jsonb; d date; t text; _st text; _ids uuid[]:='{}'; _aid uuid;
BEGIN
IF NOT COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) THEN RAISE EXCEPTION 'No autorizado'; END IF;
SELECT COALESCE(metadata,'{}'::jsonb) INTO _meta FROM public.events WHERE id=p_event FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'evento_no_encontrado'; END IF;
_fs:=COALESCE(_meta->'food_survey','{}'::jsonb);
IF p_enabled THEN
 _b:=public._food_program_bounds(p_event); IF _b IS NULL THEN RAISE EXCEPTION 'sin_estadias_validadas'; END IF;
 FOR d IN SELECT generate_series((_b->>'start')::date,(_b->>'end')::date,'1 day')::date LOOP
  FOREACH t IN ARRAY ARRAY['almuerzo','cena'] LOOP
   SELECT c->>'estado' INTO _st FROM jsonb_array_elements(COALESCE(_fs->'calendar','[]'::jsonb)) c WHERE c->>'fecha'=d::text AND c->>'tipo'=t;
   IF _st IS NULL OR _st='pendiente' THEN RAISE EXCEPTION 'servicio_sin_decidir: % %',d,t; END IF;
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['almuerzo','cena'] LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(_fs#>'{meal_program,meals}','[]'::jsonb)) m WHERE m->>'tipo'=t) THEN
   SELECT id INTO _aid FROM public.event_addons WHERE id::text=_fs#>>ARRAY['meal_program',t||'_addon_id'] AND event_id=p_event AND precio>0 AND categoria='comida_regular';
   IF _aid IS NULL THEN RAISE EXCEPTION 'extra_regular_faltante: %',t; END IF; _ids:=_ids||_aid;
  END IF;
 END LOOP;
 UPDATE public.event_addons SET activo=true,updated_at=now() WHERE id=ANY(_ids) AND NOT activo;
END IF;
_fs:=_fs||jsonb_build_object('enabled',p_enabled,'history',COALESCE(_fs->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'by',auth.uid(),'action',CASE WHEN p_enabled THEN 'enable' ELSE 'disable' END)));
UPDATE public.events SET metadata=jsonb_set(_meta,'{food_survey}',_fs,true) WHERE id=p_event;
RETURN _fs;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_food_survey_enabled(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_food_survey_enabled(uuid,boolean) TO authenticated;