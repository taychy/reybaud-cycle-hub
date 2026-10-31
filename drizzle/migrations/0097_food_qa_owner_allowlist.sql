CREATE TABLE public.trip_food_survey_qa_access (event_id uuid NOT NULL REFERENCES public.events(id),owner_id uuid NOT NULL,active boolean NOT NULL DEFAULT true,PRIMARY KEY(event_id,owner_id));
GRANT SELECT ON public.trip_food_survey_qa_access TO authenticated;
GRANT ALL ON public.trip_food_survey_qa_access TO service_role;
ALTER TABLE public.trip_food_survey_qa_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_qa_access ON public.trip_food_survey_qa_access FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE OR REPLACE FUNCTION public.can_access_trip_food_survey_qa(p_event_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.trip_food_survey_qa_access a WHERE a.event_id=p_event_id AND a.owner_id=auth.uid() AND a.active) $$;
REVOKE ALL ON FUNCTION public.can_access_trip_food_survey_qa(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_trip_food_survey_qa(uuid) TO authenticated;
ALTER POLICY own_private_qa ON public.trip_food_survey_qa USING(owner_id=auth.uid() AND active AND public.can_access_trip_food_survey_qa(event_id));
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.save_trip_food_survey_qa(uuid,jsonb)'::regprocedure);
 IF position('public.has_role(auth.uid(),''admin''::public.app_role)' in definition)=0 THEN RAISE EXCEPTION 'Unexpected QA function; no changes made'; END IF;
 definition:=replace(definition,'public.has_role(auth.uid(),''admin''::public.app_role)','public.can_access_trip_food_survey_qa(event_id)');
 EXECUTE definition;
END $$;
COMMENT ON TABLE public.trip_food_survey_qa_access IS 'Explicit per-event QA allowlist. No global role changes. Revocation immediately blocks reads and saves; case ownership still required.';