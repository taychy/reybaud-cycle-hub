REVOKE ALL ON public.event_kit_additional_jerseys FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.event_kit_additional_jerseys TO authenticated;
GRANT ALL ON public.event_kit_additional_jerseys TO service_role;
REVOKE ALL ON public.event_kit_additional_jerseys_log FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.event_kit_additional_jerseys_log TO authenticated;
GRANT SELECT,INSERT ON public.event_kit_additional_jerseys_log TO service_role;