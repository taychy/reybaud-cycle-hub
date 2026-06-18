CREATE OR REPLACE FUNCTION public.admin_get_or_create_cuenta_token(p_alumno_id uuid)
 RETURNS TABLE(id uuid, token uuid, created_at timestamp with time zone, last_accessed_at timestamp with time zone, access_count integer, last_user_agent text, last_ip text, revoked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.cuenta_corriente_tokens%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT t.* INTO v_row
  FROM public.cuenta_corriente_tokens t
  WHERE t.alumno_id = p_alumno_id AND t.revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.cuenta_corriente_tokens(alumno_id, expires_at, created_by)
    VALUES (p_alumno_id, NULL, auth.uid())
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.token, v_row.created_at, v_row.last_accessed_at,
    v_row.access_count, v_row.last_user_agent, v_row.last_ip, v_row.revoked_at;
END;
$function$;