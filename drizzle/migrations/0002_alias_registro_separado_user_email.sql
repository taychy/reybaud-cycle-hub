CREATE OR REPLACE FUNCTION public.register_current_auth_alias()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_alumno uuid := public.current_alumno_id();
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.email(), '')));
BEGIN
  IF v_alumno IS NULL OR v_uid IS NULL THEN RETURN v_alumno; END IF;

  -- identidad Auth (uuid) como alias, independiente del email
  INSERT INTO public.alumno_auth_aliases (alumno_id, user_id, is_primary)
  VALUES (v_alumno, v_uid, false)
  ON CONFLICT DO NOTHING;

  -- email como alias, independiente del uuid
  IF v_email <> '' AND v_email NOT LIKE '%@reybaud.invalid' THEN
    INSERT INTO public.alumno_auth_aliases (alumno_id, email, is_primary)
    VALUES (v_alumno, v_email, false)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.alumnos SET user_id = v_uid
   WHERE id = v_alumno AND user_id IS NULL;

  RETURN v_alumno;
END;
$fn$;
