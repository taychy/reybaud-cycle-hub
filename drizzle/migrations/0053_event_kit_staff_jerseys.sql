CREATE FUNCTION public.event_kit_staff_key(p_name text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT trim(regexp_replace(lower(translate(p_name,'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãéèêëíìîïóòôöõúùûüñç','AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')),'[^a-z0-9]+',' ','g')) $$;
CREATE TABLE public.event_kit_additional_jerseys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.events(id), recipient_name text NOT NULL,
 staff_key text NOT NULL, recipient_class text NOT NULL DEFAULT 'staff' CHECK(recipient_class='staff'), size text NOT NULL,
 quantity integer NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 100), active boolean NOT NULL DEFAULT true,
 recorded_by text NOT NULL DEFAULT 'Administración', created_by uuid, updated_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,staff_key)
);
GRANT SELECT,INSERT,UPDATE ON public.event_kit_additional_jerseys TO authenticated;
GRANT ALL ON public.event_kit_additional_jerseys TO service_role;
ALTER TABLE public.event_kit_additional_jerseys ENABLE ROW LEVEL SECURITY;
CREATE POLICY kit_staff_read ON public.event_kit_additional_jerseys FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY kit_staff_insert ON public.event_kit_additional_jerseys FOR INSERT TO authenticated WITH CHECK(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY kit_staff_update ON public.event_kit_additional_jerseys FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) WITH CHECK(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE TABLE public.event_kit_additional_jerseys_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES public.event_kit_additional_jerseys(id), actor_id uuid, recorded_by text NOT NULL, action text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_kit_additional_jerseys_log TO authenticated;
GRANT SELECT,INSERT ON public.event_kit_additional_jerseys_log TO service_role;
ALTER TABLE public.event_kit_additional_jerseys_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY kit_staff_log_read ON public.event_kit_additional_jerseys_log FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE FUNCTION public.event_kit_staff_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT(public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Solo administración'; END IF;
 NEW.recipient_name:=trim(regexp_replace(NEW.recipient_name,'\s+',' ','g')); NEW.staff_key:=public.event_kit_staff_key(NEW.recipient_name);
 IF length(NEW.staff_key)<3 OR length(NEW.recipient_name)>160 THEN RAISE EXCEPTION 'Nombre de staff inválido'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.staff_key IS DISTINCT FROM OLD.staff_key THEN RAISE EXCEPTION 'No se puede cambiar la identidad del staff'; END IF;
  NEW.created_at:=OLD.created_at; NEW.created_by:=OLD.created_by;
  IF (NEW.recipient_name,NEW.size,NEW.quantity,NEW.active,NEW.recipient_class) IS NOT DISTINCT FROM (OLD.recipient_name,OLD.size,OLD.quantity,OLD.active,OLD.recipient_class) THEN RETURN NULL; END IF;
 END IF;
 SELECT s INTO cfg FROM public.events e CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.metadata->'choice_surveys','[]'::jsonb)) s WHERE e.id=NEW.event_id AND s->>'key'='talle_camiseta' AND s->>'enabled'='true';
 IF cfg IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'options') o WHERE o->>'value'=NEW.size AND NOT coalesce((o->>'needs_follow_up')::boolean,false)) THEN RAISE EXCEPTION 'Talle de staff inválido o encuesta inactiva'; END IF;
 IF auth.uid() IS NOT NULL THEN
  IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid(); END IF;
  NEW.updated_by:=auth.uid(); NEW.recorded_by:='Administración';
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER event_kit_staff_guard BEFORE INSERT OR UPDATE ON public.event_kit_additional_jerseys FOR EACH ROW EXECUTE FUNCTION public.event_kit_staff_guard();
CREATE FUNCTION public.event_kit_staff_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 INSERT INTO public.event_kit_additional_jerseys_log(entry_id,actor_id,recorded_by,action,before_data,after_data) VALUES(NEW.id,auth.uid(),NEW.recorded_by,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW)); RETURN NEW;
END $$;
CREATE TRIGGER event_kit_staff_audit AFTER INSERT OR UPDATE ON public.event_kit_additional_jerseys FOR EACH ROW EXECUTE FUNCTION public.event_kit_staff_audit();
REVOKE ALL ON FUNCTION public.event_kit_staff_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_kit_staff_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_kit_staff_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_kit_staff_key(text) TO authenticated,service_role;