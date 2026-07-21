
CREATE OR REPLACE FUNCTION public.enforce_delivery_caja_abierta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_list_id uuid;
  v_estado text;
BEGIN
  IF TG_TABLE_NAME = 'delivery_list_payments' THEN
    v_list_id := COALESCE(NEW.list_id, OLD.list_id);
  ELSIF TG_TABLE_NAME = 'delivery_supplier_payments' THEN
    v_list_id := COALESCE(NEW.delivery_list_id, OLD.delivery_list_id);
  END IF;
  SELECT caja_estado INTO v_estado FROM public.delivery_lists WHERE id = v_list_id;
  IF v_estado = 'cerrada' AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'La caja de esta lista de entrega está cerrada';
  END IF;
  RETURN NEW;
END;
$function$;
