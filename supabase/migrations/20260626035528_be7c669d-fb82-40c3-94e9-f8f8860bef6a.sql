CREATE OR REPLACE FUNCTION public.audit_gastos_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text := 'system';
  v_entity_id text;
  v_action text;
  v_details jsonb;
  v_old_arch timestamptz;
  v_new_arch timestamptz;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    SELECT COALESCE(role::text, 'admin') INTO v_role
      FROM public.admin_profiles WHERE user_id = v_user_id LIMIT 1;
    IF v_role IS NULL THEN v_role := 'admin'; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'crear_' || TG_TABLE_NAME;
    v_entity_id := (row_to_json(NEW)->>'id');
    v_details := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'editar_' || TG_TABLE_NAME;
    v_entity_id := (row_to_json(NEW)->>'id');
    IF TG_TABLE_NAME = 'gastos_recurrentes' THEN
      v_old_arch := NULLIF(to_jsonb(OLD)->>'archivado_at','')::timestamptz;
      v_new_arch := NULLIF(to_jsonb(NEW)->>'archivado_at','')::timestamptz;
      IF v_old_arch IS NULL AND v_new_arch IS NOT NULL THEN
        v_action := 'archivar_gastos_recurrentes';
      ELSIF v_old_arch IS NOT NULL AND v_new_arch IS NULL THEN
        v_action := 'desarchivar_gastos_recurrentes';
      END IF;
    END IF;
    v_details := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'eliminar_' || TG_TABLE_NAME;
    v_entity_id := (row_to_json(OLD)->>'id');
    v_details := jsonb_build_object('before', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
  VALUES (v_user_id, v_email, v_role, v_action, TG_TABLE_NAME, v_entity_id, v_details);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;