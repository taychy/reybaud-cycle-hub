DROP POLICY IF EXISTS "Public can view coach absence schedule" ON public.ausencias_coaches;
ALTER VIEW public.coaches_public SET (security_invoker = on);