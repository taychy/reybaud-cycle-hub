CREATE FUNCTION public._rescheduling_verified_email() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=lower(auth.email())) $$;
REVOKE ALL ON FUNCTION public._rescheduling_verified_email() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.get_rescheduling_context(uuid,uuid,text)'::regprocedure) INTO definition;
definition:=replace(definition,'auth.jwt()->>''email_verified'' IS DISTINCT FROM ''false''','public._rescheduling_verified_email()');
EXECUTE definition;
SELECT pg_get_functiondef('public._rescheduling_financial(uuid)'::regprocedure) INTO definition;
definition:=replace(definition,'sum(coalesce(obligation_amount_contract,equivalent_amount_event_currency,amount)),0)','sum(coalesce(obligation_amount_contract,equivalent_amount_event_currency,amount)) FILTER (WHERE coalesce(event_currency,r.currency_snapshot,r.moneda,''ARS'')=''ARS'' AND (currency=''ARS'' OR obligation_amount_contract IS NOT NULL OR equivalent_amount_event_currency IS NOT NULL)),0)');
definition:=replace(definition,'FILTER(WHERE replacement_reservation_id=p_id)','FILTER(WHERE replacement_reservation_id=p_id AND currency=''ARS'')');
definition:=replace(definition,'FILTER(WHERE original_reservation_id=p_id)','FILTER(WHERE original_reservation_id=p_id AND currency=''ARS'')');
EXECUTE definition;
END $$;