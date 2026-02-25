
CREATE OR REPLACE FUNCTION public.register_coach(
  _user_id uuid,
  _nombre text,
  _email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.coaches (user_id, nombre, email)
  VALUES (_user_id, _nombre, _email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'coach');
END;
$$;
