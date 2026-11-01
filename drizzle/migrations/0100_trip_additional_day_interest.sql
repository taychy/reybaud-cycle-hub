CREATE TABLE public.trip_additional_day_config (
 event_id uuid NOT NULL REFERENCES public.events(id), package_id uuid NOT NULL REFERENCES public.event_packages(id),
 addon_id uuid NOT NULL REFERENCES public.event_addons(id), required_choice text NOT NULL, original_nights integer NOT NULL, extra_nights integer NOT NULL DEFAULT 1,
 PRIMARY KEY(event_id,package_id)
);
GRANT SELECT ON public.trip_additional_day_config TO authenticated;
GRANT ALL ON public.trip_additional_day_config TO service_role;
ALTER TABLE public.trip_additional_day_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY day_config_admin ON public.trip_additional_day_config FOR SELECT TO authenticated USING(public._rescheduling_admin());
INSERT INTO public.trip_additional_day_config(event_id,package_id,addon_id,required_choice,original_nights)
 SELECT a.event_id,p.id,a.id,'attend_5_9',e.end_date::date-e.date::date FROM public.event_addons a JOIN public.events e ON e.id=a.event_id JOIN public.event_packages p ON p.event_id=a.event_id AND p.id=ANY(a.aplica_a_paquetes)
 WHERE a.id IN ('a2a86448-789a-4f86-bf5b-c2b1e179c111','a2a86448-789a-4f86-bf5b-c2b1e179c112','a2a86448-789a-4f86-bf5b-c2b1e179c113') AND NOT a.activo;
CREATE TABLE public.trip_additional_day_responses (
 reservation_id uuid PRIMARY KEY REFERENCES public.event_reservations(id), event_id uuid NOT NULL REFERENCES public.events(id),
 answer text NOT NULL CHECK(answer IN ('interesado','no','consulta')), status text NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','resuelto')),
 eligibility_snapshot jsonb NOT NULL, actor_id uuid, source text NOT NULL, revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, resolved_by uuid, resolution_note text
);
GRANT SELECT ON public.trip_additional_day_responses TO authenticated;
GRANT ALL ON public.trip_additional_day_responses TO service_role;
ALTER TABLE public.trip_additional_day_responses ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public._trip_day_access(p_reservation_id uuid,p_token text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.event_reservations r WHERE r.id=p_reservation_id AND (public._rescheduling_admin() OR (auth.uid() IS NOT NULL AND r.alumno_id=public.current_alumno_id()) OR (p_token IS NOT NULL AND length(p_token)>=32 AND r.access_token=p_token)))
$$;
REVOKE ALL ON FUNCTION public._trip_day_access(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE POLICY own_day_response ON public.trip_additional_day_responses FOR SELECT TO authenticated USING(public._trip_day_access(reservation_id));
GRANT EXECUTE ON FUNCTION public._trip_day_access(uuid,text) TO authenticated;
CREATE TABLE public.trip_additional_day_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES public.event_reservations(id), event_id uuid NOT NULL REFERENCES public.events(id),
 before_data jsonb, after_data jsonb NOT NULL, actor_id uuid, source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trip_additional_day_history TO authenticated;
GRANT ALL ON public.trip_additional_day_history TO service_role;
ALTER TABLE public.trip_additional_day_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY day_history_admin ON public.trip_additional_day_history FOR SELECT TO authenticated USING(public._rescheduling_admin());
CREATE OR REPLACE FUNCTION public._trip_day_context(p_reservation_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.event_reservations; c public.trip_additional_day_config; q public.reservation_rescheduling_requests; s jsonb; response public.trip_additional_day_responses; valid boolean; nights integer;
BEGIN
 SELECT * INTO r FROM public.event_reservations WHERE id=p_reservation_id;
 IF NOT FOUND OR r.reservation_status NOT IN ('reserva_confirmada','confirmada') THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.trip_additional_day_config WHERE event_id=r.event_id AND package_id=r.package_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO q FROM public.reservation_rescheduling_requests WHERE reservation_id=r.id AND event_id=r.event_id;
 IF NOT FOUND OR q.review_status IS DISTINCT FROM 'validada' OR q.choice IS DISTINCT FROM c.required_choice THEN RETURN NULL; END IF;
 s:=public._trip_food_stay(r.id); IF s IS NULL THEN RETURN NULL; END IF;
 nights:=(s->>'end')::date-(s->>'start')::date;
 IF nights<>c.original_nights+c.extra_nights OR c.extra_nights<>1 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.event_addons a WHERE a.id=c.addon_id AND a.event_id=r.event_id AND r.package_id=ANY(a.aplica_a_paquetes)) THEN RETURN NULL; END IF;
 SELECT * INTO response FROM public.trip_additional_day_responses WHERE reservation_id=r.id;
 s:=s||jsonb_build_object('choice',q.choice,'request_revision',q.revision,'package_id',r.package_id,'original_nights',c.original_nights);
 valid:=response.eligibility_snapshot=s;
 RETURN jsonb_build_object('reservation_id',r.id,'event_id',r.event_id,'start',s->>'start','end',s->>'end','original_nights',c.original_nights,'original_days',c.original_nights+1,'selected_nights',nights,'eligibility_snapshot',s,
 'answer',CASE WHEN valid THEN response.answer END,'status',CASE WHEN NOT coalesce(valid,false) THEN 'sin_respuesta' WHEN response.status='resuelto' THEN 'resuelto' ELSE response.answer END,'stale',response.reservation_id IS NOT NULL AND NOT coalesce(valid,false),'updated_at',response.updated_at,
 'existing_night',EXISTS(SELECT 1 FROM public.reservation_addons ra JOIN public.event_addons a ON a.id=ra.addon_id WHERE ra.reservation_id=r.id AND (ra.noche_timing IS NOT NULL OR a.categoria='noche_extra' OR a.nombre ILIKE '%noche extra%')));
END $$;
REVOKE ALL ON FUNCTION public._trip_day_context(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_trip_additional_day(p_reservation_id uuid,p_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public._trip_day_access(p_reservation_id,p_token) THEN RAISE EXCEPTION 'No autorizado'; END IF; RETURN public._trip_day_context(p_reservation_id); END $$;
REVOKE ALL ON FUNCTION public.get_trip_additional_day(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_additional_day(uuid,text) TO authenticated,anon;
CREATE OR REPLACE FUNCTION public.save_trip_additional_day(p_reservation_id uuid,p_answer text,p_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; old public.trip_additional_day_responses; saved public.trip_additional_day_responses;
BEGIN
 PERFORM 1 FROM public.event_reservations WHERE id=p_reservation_id FOR UPDATE;
 PERFORM 1 FROM public.reservation_rescheduling_requests WHERE reservation_id=p_reservation_id FOR SHARE;
 IF NOT public._trip_day_access(p_reservation_id,p_token) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_answer IS NULL OR p_answer NOT IN ('interesado','no','consulta') THEN RAISE EXCEPTION 'Respuesta inválida'; END IF;
 ctx:=public._trip_day_context(p_reservation_id); IF ctx IS NULL THEN RAISE EXCEPTION 'Esta reserva ya no es elegible'; END IF;
 SELECT * INTO old FROM public.trip_additional_day_responses WHERE reservation_id=p_reservation_id;
 IF old.answer=p_answer AND old.eligibility_snapshot=ctx->'eligibility_snapshot' THEN RETURN public._trip_day_context(p_reservation_id); END IF;
 INSERT INTO public.trip_additional_day_responses(reservation_id,event_id,answer,eligibility_snapshot,actor_id,source)
 VALUES(p_reservation_id,(ctx->>'event_id')::uuid,p_answer,ctx->'eligibility_snapshot',auth.uid(),CASE WHEN p_token IS NOT NULL THEN 'token' ELSE 'session' END)
 ON CONFLICT(reservation_id) DO UPDATE SET answer=EXCLUDED.answer,eligibility_snapshot=EXCLUDED.eligibility_snapshot,actor_id=EXCLUDED.actor_id,source=EXCLUDED.source,revision=trip_additional_day_responses.revision+1,updated_at=now(),status='pendiente',resolved_at=NULL,resolved_by=NULL,resolution_note=NULL RETURNING * INTO saved;
 INSERT INTO public.trip_additional_day_history(reservation_id,event_id,before_data,after_data,actor_id,source) VALUES(p_reservation_id,saved.event_id,CASE WHEN old.reservation_id IS NOT NULL THEN to_jsonb(old) END,to_jsonb(saved),auth.uid(),saved.source);
 RETURN public._trip_day_context(p_reservation_id);
END $$;
REVOKE ALL ON FUNCTION public.save_trip_additional_day(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_trip_additional_day(uuid,text,text) TO authenticated,anon;
CREATE OR REPLACE FUNCTION public.admin_trip_additional_day_report(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT coalesce(jsonb_agg(ctx||jsonb_build_object('name',concat_ws(' ',coalesce(al.nombre,ep.nombre,r.external_first_name),coalesce(al.apellido,ep.apellido,r.external_last_name)),'package',p.nombre,'estimated_amount',a.precio,'currency',a.currency,'resolution_note',resp.resolution_note) ORDER BY p.nombre,r.id),'[]'::jsonb) INTO result
 FROM public.event_reservations r JOIN public.trip_additional_day_config c ON c.event_id=r.event_id AND c.package_id=r.package_id JOIN public.event_packages p ON p.id=r.package_id JOIN public.event_addons a ON a.id=c.addon_id
 LEFT JOIN public.alumnos al ON al.id=r.alumno_id LEFT JOIN public.event_external_participants ep ON ep.id=r.external_participant_id LEFT JOIN public.trip_additional_day_responses resp ON resp.reservation_id=r.id
 CROSS JOIN LATERAL (SELECT public._trip_day_context(r.id) ctx) x WHERE r.event_id=p_event_id AND ctx IS NOT NULL;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_trip_additional_day_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_trip_additional_day_report(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_resolve_trip_additional_day(p_reservation_id uuid,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.trip_additional_day_responses; saved public.trip_additional_day_responses;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
 PERFORM 1 FROM public.event_reservations WHERE id=p_reservation_id FOR UPDATE;
 PERFORM 1 FROM public.reservation_rescheduling_requests WHERE reservation_id=p_reservation_id FOR SHARE;
 IF public._trip_day_context(p_reservation_id) IS NULL THEN RAISE EXCEPTION 'Reserva no elegible'; END IF;
 IF length(trim(coalesce(p_note,'')))=0 OR length(p_note)>1000 THEN RAISE EXCEPTION 'Registrá el resultado de la revisión'; END IF;
 SELECT * INTO old FROM public.trip_additional_day_responses WHERE reservation_id=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR old.eligibility_snapshot IS DISTINCT FROM public._trip_day_context(p_reservation_id)->'eligibility_snapshot' THEN RAISE EXCEPTION 'Falta respuesta vigente'; END IF;
 IF old.status='resuelto' AND old.resolution_note=trim(p_note) THEN RETURN; END IF;
 UPDATE public.trip_additional_day_responses SET status='resuelto',resolved_at=now(),resolved_by=auth.uid(),resolution_note=trim(p_note),updated_at=now() WHERE reservation_id=p_reservation_id RETURNING * INTO saved;
 INSERT INTO public.trip_additional_day_history(reservation_id,event_id,before_data,after_data,actor_id,source) VALUES(p_reservation_id,saved.event_id,to_jsonb(old),to_jsonb(saved),auth.uid(),'admin');
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_trip_additional_day(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_trip_additional_day(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_trip_additional_day_link(p_reservation_id uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t text;
BEGIN
 IF NOT public._rescheduling_admin() OR public._trip_day_context(p_reservation_id) IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT access_token INTO t FROM public.event_reservations WHERE id=p_reservation_id;
 IF t IS NULL OR length(t)<32 THEN RAISE EXCEPTION 'No existe enlace personal válido'; END IF;
 RETURN '/viaje/mi-reserva?token='||t;
END $$;
REVOKE ALL ON FUNCTION public.admin_trip_additional_day_link(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_trip_additional_day_link(uuid) TO authenticated;
CREATE TABLE public.trip_additional_day_qa (
 event_id uuid NOT NULL REFERENCES public.events(id), owner_id uuid NOT NULL, case_key text NOT NULL CHECK(case_key IN ('sin_noche_previa','con_noche_previa')),answer text CHECK(answer IN ('interesado','no','consulta')), updated_at timestamptz, PRIMARY KEY(event_id,owner_id,case_key)
);
GRANT SELECT ON public.trip_additional_day_qa TO authenticated;
GRANT ALL ON public.trip_additional_day_qa TO service_role;
ALTER TABLE public.trip_additional_day_qa ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_day_qa ON public.trip_additional_day_qa FOR SELECT TO authenticated USING(owner_id=auth.uid() AND public.can_access_trip_food_survey_qa(event_id));
INSERT INTO public.trip_additional_day_qa(event_id,owner_id,case_key) SELECT a.event_id,a.owner_id,k FROM public.trip_food_survey_qa_access a CROSS JOIN (VALUES('sin_noche_previa'),('con_noche_previa')) cases(k) WHERE a.active AND EXISTS(SELECT 1 FROM public.trip_additional_day_config c WHERE c.event_id=a.event_id);
CREATE OR REPLACE FUNCTION public.save_trip_additional_day_qa(p_event_id uuid,p_case_key text,p_answer text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_access_trip_food_survey_qa(p_event_id) OR p_answer IS NULL OR p_answer NOT IN ('interesado','no','consulta') THEN RAISE EXCEPTION 'Prueba o respuesta no autorizada'; END IF;
 UPDATE public.trip_additional_day_qa SET answer=p_answer,updated_at=now() WHERE event_id=p_event_id AND owner_id=auth.uid() AND case_key=p_case_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caso no habilitado'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_trip_additional_day_qa(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_trip_additional_day_qa(uuid,text,text) TO authenticated;
COMMENT ON TABLE public.trip_additional_day_responses IS 'Interest/consultation only. Never purchases, payments, contract acceptance, dates or rooming. Eligibility revalidated on every read/save; revision snapshot preserves stale history.';
