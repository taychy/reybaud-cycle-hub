DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.admin_rescheduling_settlement_preview(uuid)'::regprocedure) INTO d;
d:=replace(d,'s->''request''-''snapshot''-''actor_id''-''command_id''-''reviewed_by''','(s->''request'') - ARRAY[''snapshot'',''actor_id'',''command_id'',''reviewed_by'']::text[]');
EXECUTE d;
END $$;
CREATE FUNCTION public.admin_rescheduling_settlement_report(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE rows jsonb:='[]'; r record; p jsonb;BEGIN
IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
FOR r IN SELECT id FROM public.event_reservations WHERE event_id=p_event_id AND reservation_status NOT IN ('cancelada','rechazada','cancelled','cancelado') ORDER BY id LOOP
p:=public.admin_rescheduling_settlement_preview(r.id);
rows:=rows||jsonb_build_array(jsonb_build_object('reservation_id',r.id,'totals',p->'totals','proposal',p->'proposal','stale',p->'stale'));
END LOOP;
RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.admin_rescheduling_settlement_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_rescheduling_settlement_report(uuid) TO authenticated;