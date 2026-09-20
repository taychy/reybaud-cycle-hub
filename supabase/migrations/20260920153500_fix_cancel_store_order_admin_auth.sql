-- Fix cancel_store_order authorization for admin/deposito.
-- The previous wrapper cast 'super_admin' to app_role, but that enum does not contain that value.
-- Keep stock/return behavior delegated to _cancel_store_order_core.

CREATE OR REPLACE FUNCTION public.cancel_store_order(
  _order_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'deposito'::public.app_role)
    OR public.is_super_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN public._cancel_store_order_core(
    _order_id,
    COALESCE(_reason, ''),
    v_uid
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_store_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_store_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_store_order(uuid, text) TO authenticated;
