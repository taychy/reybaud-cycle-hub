CREATE OR REPLACE FUNCTION public.admin_upsert_public_jornada(p_slug text, p_title text, p_activity_date date, p_capacity integer, p_is_open boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public_jornadas; v_confirmed integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'Identificador inválido'; END IF;
  IF coalesce(trim(p_title),'') = '' OR length(p_title) > 200 THEN RAISE EXCEPTION 'Título inválido'; END IF;
  IF p_activity_date IS NULL THEN RAISE EXCEPTION 'Fecha requerida'; END IF;
  IF p_capacity IS NULL OR p_capacity < 1 OR p_capacity > 5000 THEN RAISE EXCEPTION 'Cupo inválido'; END IF;
  SELECT * INTO v_row FROM public_jornadas WHERE slug = p_slug FOR UPDATE;
  IF FOUND THEN
    SELECT count(*) INTO v_confirmed FROM public_jornada_attendees WHERE jornada_id = v_row.id AND response = 'voy';
    IF p_capacity < v_confirmed THEN RAISE EXCEPTION 'El cupo no puede ser menor a los % confirmados', v_confirmed; END IF;
    UPDATE public_jornadas SET title = trim(p_title), activity_date = p_activity_date, capacity = p_capacity, is_open = coalesce(p_is_open, true) WHERE id = v_row.id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public_jornadas(slug, title, activity_date, capacity, is_open) VALUES (p_slug, trim(p_title), p_activity_date, p_capacity, coalesce(p_is_open, true)) RETURNING * INTO v_row;
    v_confirmed := 0;
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'slug', v_row.slug, 'capacity', v_row.capacity, 'confirmed', v_confirmed, 'is_open', v_row.is_open);
END $$;
REVOKE ALL ON FUNCTION public.admin_upsert_public_jornada(text, text, date, integer, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_public_jornada(text, text, date, integer, boolean) TO authenticated;