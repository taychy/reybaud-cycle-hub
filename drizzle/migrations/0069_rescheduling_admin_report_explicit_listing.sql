-- Admin report lists reservations itself (explicit admin RPC), independent of the public context.
CREATE OR REPLACE FUNCTION public.admin_rescheduling_report(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE c record;r record;arr jsonb:='[]';prior jsonb; BEGIN
IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
SELECT * INTO c FROM event_rescheduling_campaigns WHERE event_id=p_event_id;
IF NOT FOUND THEN RETURN jsonb_build_object('available',false); END IF;
FOR r IN SELECT er.*,coalesce(nullif(concat_ws(' ',a.nombre,a.apellido),''),nullif(concat_ws(' ',ep.nombre,ep.apellido),''),concat_ws(' ',er.external_first_name,er.external_last_name)) AS participant FROM event_reservations er LEFT JOIN alumnos a ON a.id=er.alumno_id LEFT JOIN event_external_participants ep ON ep.id=er.external_participant_id WHERE er.event_id=p_event_id AND er.reservation_status NOT IN ('cancelada','rechazada','cancelled','cancelado') LOOP
arr:=arr || jsonb_build_array(jsonb_build_object('reservation_id',r.id,'participant',r.participant,'package',r.package_nombre_snapshot,'financial',public._rescheduling_financial(r.id),'size',public._rescheduling_size(r.id),'request',(SELECT to_jsonb(q)-'snapshot'-'actor_id'-'reviewed_by'-'command_id' FROM reservation_rescheduling_requests q WHERE q.reservation_id=r.id)));
END LOOP;
SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'original_reservation_id',original_reservation_id,'replacement_reservation_id',replacement_reservation_id,'package_id',package_id)),'[]') INTO prior FROM reservation_transfers WHERE event_id=p_event_id;
RETURN jsonb_build_object('available',true,'admin',true,'campaign',to_jsonb(c),'reservations',arr,'transfers',prior); END $function$;