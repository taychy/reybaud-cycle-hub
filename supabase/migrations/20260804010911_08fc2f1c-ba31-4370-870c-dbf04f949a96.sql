CREATE OR REPLACE FUNCTION public.start_stock_count(p_categoria text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_id uuid;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id INTO v_id
  FROM public.stock_counts
  WHERE estado = 'en_curso' AND confirmado_por = v_uid AND coalesce(categoria,'') = coalesce(p_categoria,'')
  ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('count_id', v_id, 'resumed', true);
  END IF;

  SELECT coalesce(
    (SELECT nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') FROM public.admin_profiles WHERE user_id = v_uid LIMIT 1),
    (SELECT email FROM public.admin_profiles WHERE user_id = v_uid LIMIT 1),
    (SELECT nombre FROM public.deposito_profiles WHERE user_id = v_uid LIMIT 1),
    (SELECT email FROM auth.users WHERE id = v_uid)
  ) INTO v_nombre;

  INSERT INTO public.stock_counts (categoria, confirmado_por, confirmado_por_nombre, estado)
  VALUES (p_categoria, v_uid, v_nombre, 'en_curso')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('count_id', v_id, 'resumed', false);
END;
$$;