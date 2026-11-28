REVOKE EXECUTE ON FUNCTION public.admin_review_event_enrollment_request(uuid,text,text,boolean,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_event_enrollment_request(uuid,text,text,boolean,numeric,text) TO authenticated, service_role;
CREATE INDEX event_enrollment_requests_package_idx ON public.event_enrollment_requests (package_id);
CREATE INDEX event_enrollment_requests_requester_alumno_idx ON public.event_enrollment_requests (requester_alumno_id);