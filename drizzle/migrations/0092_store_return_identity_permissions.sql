CREATE OR REPLACE FUNCTION public.store_return_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO public AS $$
BEGIN
 IF NEW.producto_recibido_id IS DISTINCT FROM OLD.producto_recibido_id OR NEW.variante_recibida IS DISTINCT FROM OLD.variante_recibida THEN
  IF NOT (COALESCE(public.has_role(auth.uid(),'admin'::public.app_role),false) OR COALESCE(public.has_role(auth.uid(),'deposito'::public.app_role),false) OR COALESCE(auth.role()='service_role',false)) THEN RAISE EXCEPTION 'Solo el personal autorizado puede identificar la devolución física'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER trg_store_return_identity_guard BEFORE UPDATE ON public.store_cambios FOR EACH ROW EXECUTE FUNCTION public.store_return_identity_guard();