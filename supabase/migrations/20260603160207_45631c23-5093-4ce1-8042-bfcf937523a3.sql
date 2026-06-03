CREATE OR REPLACE FUNCTION public.check_admin_or_coach_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles WHERE email = _email AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.coaches WHERE email = _email AND estado = 'activo'
  ) OR EXISTS (
    SELECT 1 FROM public.deposito_profiles WHERE email = _email AND estado = 'activo'
  )
$function$;