DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.admin_review_rescheduling(uuid,integer,text,text,uuid)'::regprocedure) INTO definition;
definition:=replace(definition,'SELECT * INTO oldrow FROM reservation_rescheduling_requests WHERE reservation_id=p_reservation_id FOR UPDATE;','PERFORM 1 FROM public.event_reservations WHERE id=p_reservation_id FOR UPDATE;
SELECT * INTO oldrow FROM reservation_rescheduling_requests WHERE reservation_id=p_reservation_id FOR UPDATE;');
definition:=replace(definition,'IF EXISTS(SELECT 1 FROM reservation_rescheduling_history WHERE command_id=p_command_id AND reservation_id=p_reservation_id) THEN RETURN; END IF;','IF EXISTS(SELECT 1 FROM reservation_rescheduling_history WHERE command_id=p_command_id) THEN
IF NOT EXISTS(SELECT 1 FROM reservation_rescheduling_history WHERE command_id=p_command_id AND reservation_id=p_reservation_id AND origin=''admin'' AND after_data->>''review_status''=p_status AND after_data->>''admin_note''=p_note) THEN RAISE EXCEPTION ''Identificador ya utilizado para otra operación''; END IF;
RETURN; END IF;');
EXECUTE definition;
SELECT pg_get_functiondef('public._rescheduling_financial(uuid)'::regprocedure) INTO definition;
definition:=replace(definition,'transfer OR ambiguous OR coalesce(r.currency_snapshot,r.moneda,''ARS'')<>''ARS''','transfer OR ambiguous OR coalesce(r.currency_snapshot,r.moneda,''ARS'')<>''ARS'' OR coalesce((obligation->>''returned'')::numeric,0)>refunds');
EXECUTE definition;
END $$;