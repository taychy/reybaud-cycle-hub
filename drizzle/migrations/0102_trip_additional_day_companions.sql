ALTER TABLE public.trip_additional_day_responses ADD COLUMN IF NOT EXISTS companions_answer text CHECK (companions_answer IN ('si','no','no_se'));
ALTER TABLE public.trip_additional_day_qa ADD COLUMN IF NOT EXISTS companions_answer text CHECK (companions_answer IN ('si','no','no_se'));

CREATE OR REPLACE FUNCTION public._trip_day_shared(p_reservation_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT rm.capacidad>1 FROM public.event_room_assignments a JOIN public.event_rooms rm ON rm.id=a.room_id WHERE a.reservation_id=p_reservation_id LIMIT 1),false)
$$;
REVOKE ALL ON FUNCTION public._trip_day_shared(uuid) FROM PUBLIC,anon,authenticated;

-- Admin-only: active roommates whose validated stay differs from the reservation's own validated choice.
CREATE OR REPLACE FUNCTION public._trip_day_roommate_mismatch(p_reservation_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.event_room_assignments a JOIN public.event_room_assignments a2 ON a2.room_id=a.room_id AND a2.reservation_id<>a.reservation_id
  JOIN public.event_reservations r2 ON r2.id=a2.reservation_id AND r2.reservation_status IN ('reserva_confirmada','confirmada')
  LEFT JOIN public.reservation_rescheduling_requests q ON q.reservation_id=a.reservation_id
  LEFT JOIN public.reservation_rescheduling_requests q2 ON q2.reservation_id=r2.id
  WHERE a.reservation_id=p_reservation_id AND (q2.review_status IS DISTINCT FROM 'validada' OR q2.choice IS DISTINCT FROM q.choice))
$$;
REVOKE ALL ON FUNCTION public._trip_day_roommate_mismatch(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_additional_day(p_reservation_id uuid, p_token text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE ctx jsonb; resp public.trip_additional_day_responses; ad public.event_addons;
BEGIN
 IF NOT public._trip_day_access(p_reservation_id,p_token) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 ctx:=public._trip_day_context(p_reservation_id); IF ctx IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO resp FROM public.trip_additional_day_responses WHERE reservation_id=p_reservation_id;
 SELECT a.* INTO ad FROM public.event_reservations r JOIN public.trip_additional_day_config c ON c.event_id=r.event_id AND c.package_id=r.package_id JOIN public.event_addons a ON a.id=c.addon_id WHERE r.id=p_reservation_id;
 RETURN ctx||jsonb_build_object('shared',public._trip_day_shared(p_reservation_id),'amount',ad.precio,'currency',ad.currency,
  'companions_answer',CASE WHEN ctx->>'answer'='interesado' THEN resp.companions_answer END);
END $function$;

CREATE OR REPLACE FUNCTION public.save_trip_additional_day_companions(p_reservation_id uuid, p_answer text, p_token text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE ctx jsonb; old public.trip_additional_day_responses; saved public.trip_additional_day_responses;
BEGIN
 PERFORM 1 FROM public.event_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT public._trip_day_access(p_reservation_id,p_token) THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_answer IS NULL OR p_answer NOT IN ('si','no','no_se') THEN RAISE EXCEPTION 'Respuesta inválida'; END IF;
 ctx:=public._trip_day_context(p_reservation_id);
 IF ctx IS NULL OR ctx->>'answer' IS DISTINCT FROM 'interesado' THEN RAISE EXCEPTION 'Primero indicá que querés contratar la jornada'; END IF;
 IF NOT public._trip_day_shared(p_reservation_id) THEN RAISE EXCEPTION 'La reserva no es compartida'; END IF;
 SELECT * INTO old FROM public.trip_additional_day_responses WHERE reservation_id=p_reservation_id FOR UPDATE;
 IF old.companions_answer IS NOT DISTINCT FROM p_answer THEN RETURN public.get_trip_additional_day(p_reservation_id,p_token); END IF;
 UPDATE public.trip_additional_day_responses SET companions_answer=p_answer,revision=revision+1,updated_at=now(),status='pendiente',resolved_at=NULL,resolved_by=NULL,resolution_note=NULL,actor_id=auth.uid(),source=CASE WHEN p_token IS NOT NULL THEN 'token' ELSE 'session' END
  WHERE reservation_id=p_reservation_id RETURNING * INTO saved;
 INSERT INTO public.trip_additional_day_history(reservation_id,event_id,before_data,after_data,actor_id,source) VALUES(p_reservation_id,saved.event_id,to_jsonb(old),to_jsonb(saved),auth.uid(),saved.source);
 RETURN public.get_trip_additional_day(p_reservation_id,p_token);
END $function$;
REVOKE ALL ON FUNCTION public.save_trip_additional_day_companions(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_trip_additional_day_companions(uuid,text,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_trip_additional_day_report(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT coalesce(jsonb_agg(ctx||jsonb_build_object('name',concat_ws(' ',coalesce(al.nombre,ep.nombre,r.external_first_name),coalesce(al.apellido,ep.apellido,r.external_last_name)),'package',p.nombre,'estimated_amount',a.precio,'currency',a.currency,'resolution_note',resp.resolution_note,
   'shared',public._trip_day_shared(r.id),'roommate_mismatch',public._trip_day_roommate_mismatch(r.id),'companions_answer',CASE WHEN ctx->>'answer'='interesado' THEN resp.companions_answer END) ORDER BY p.nombre,r.id),'[]'::jsonb) INTO result
 FROM public.event_reservations r JOIN public.trip_additional_day_config c ON c.event_id=r.event_id AND c.package_id=r.package_id JOIN public.event_packages p ON p.id=r.package_id JOIN public.event_addons a ON a.id=c.addon_id
 LEFT JOIN public.alumnos al ON al.id=r.alumno_id LEFT JOIN public.event_external_participants ep ON ep.id=r.external_participant_id LEFT JOIN public.trip_additional_day_responses resp ON resp.reservation_id=r.id
 CROSS JOIN LATERAL (SELECT public._trip_day_context(r.id) ctx) x WHERE r.event_id=p_event_id AND ctx IS NOT NULL;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.save_trip_additional_day_qa_companions(p_event_id uuid, p_case_key text, p_answer text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NOT public.can_access_trip_food_survey_qa(p_event_id) OR p_answer IS NULL OR p_answer NOT IN ('si','no','no_se') THEN RAISE EXCEPTION 'Prueba o respuesta no autorizada'; END IF;
 UPDATE public.trip_additional_day_qa SET companions_answer=p_answer,updated_at=now() WHERE event_id=p_event_id AND owner_id=auth.uid() AND case_key=p_case_key AND answer='interesado';
 IF NOT FOUND THEN RAISE EXCEPTION 'Caso no habilitado'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.save_trip_additional_day_qa_companions(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_trip_additional_day_qa_companions(uuid,text,text) TO authenticated;