-- 1) Views: enforce querying user's permissions (no more definer-style bypass)
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND (c.reloptions IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(c.reloptions) o WHERE o LIKE 'security_invoker=%'
      ))
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v.relname);
  END LOOP;
END $$;

-- 2) admin_profiles: only super_admins may grant/revoke super_admin or re-point a profile
CREATE OR REPLACE FUNCTION public.guard_admin_profiles_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_super boolean;
BEGIN
  -- Internal/service-role operations (no JWT user) keep working
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  caller_is_super := public.is_super_admin(caller);
  IF caller_is_super THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'super_admin' THEN
      RAISE EXCEPTION 'Solo un Super Admin puede crear perfiles Super Admin';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Solo un Super Admin puede cambiar el rol de un perfil administrativo';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Solo un Super Admin puede reasignar un perfil administrativo';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_admin_profiles_privileges_trg ON public.admin_profiles;
CREATE TRIGGER guard_admin_profiles_privileges_trg
BEFORE INSERT OR UPDATE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_admin_profiles_privileges();