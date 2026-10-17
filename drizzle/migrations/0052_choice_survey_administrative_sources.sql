CREATE TABLE public.event_choice_survey_admin_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reservation_id uuid NOT NULL REFERENCES public.event_reservations(id),
 survey_key text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed','pending')),
 confirmed_value text,
 candidates text[] NOT NULL DEFAULT '{}',
 notes text NOT NULL DEFAULT '',
 recorded_by text NOT NULL DEFAULT 'Administración',
 created_by uuid,
 updated_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(reservation_id,survey_key)
);
GRANT SELECT, INSERT, UPDATE ON public.event_choice_survey_admin_entries TO authenticated;
GRANT ALL ON public.event_choice_survey_admin_entries TO service_role;
ALTER TABLE public.event_choice_survey_admin_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY choice_admin_read ON public.event_choice_survey_admin_entries FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY choice_admin_insert ON public.event_choice_survey_admin_entries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY choice_admin_update ON public.event_choice_survey_admin_entries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE TABLE public.event_choice_survey_admin_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES public.event_choice_survey_admin_entries(id), actor_id uuid, recorded_by text NOT NULL, action text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_choice_survey_admin_log TO authenticated;
GRANT SELECT, INSERT ON public.event_choice_survey_admin_log TO service_role;
ALTER TABLE public.event_choice_survey_admin_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY choice_admin_log_read ON public.event_choice_survey_admin_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid()));
CREATE FUNCTION public.choice_survey_admin_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb; res_status text; val text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id OR NEW.survey_key IS DISTINCT FROM OLD.survey_key THEN RAISE EXCEPTION 'No se puede cambiar reserva ni encuesta'; END IF;
  NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at;
 END IF;
 SELECT r.reservation_status,s INTO res_status,cfg FROM public.event_reservations r JOIN public.events e ON e.id=r.event_id CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.metadata->'choice_surveys','[]'::jsonb)) s WHERE r.id=NEW.reservation_id AND s->>'key'=NEW.survey_key AND s->>'enabled'='true';
 IF cfg IS NULL OR res_status IS NULL OR res_status IN ('cancelada','rechazada') THEN RAISE EXCEPTION 'Reserva o encuesta no disponible'; END IF;
 IF NEW.status='confirmed' THEN
  IF NEW.confirmed_value IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cfg->'options') o WHERE o->>'value'=NEW.confirmed_value AND coalesce((o->>'needs_follow_up')::boolean,false)=false) OR cardinality(NEW.candidates)>0 THEN RAISE EXCEPTION 'Talle confirmado inválido'; END IF;
 ELSE
  IF NEW.confirmed_value IS NOT NULL THEN RAISE EXCEPTION 'Pendiente no puede tener talle confirmado'; END IF;
 END IF;
 FOREACH val IN ARRAY NEW.candidates LOOP
  IF val IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cfg->'options') o WHERE o->>'value'=val AND coalesce((o->>'needs_follow_up')::boolean,false)=false) THEN RAISE EXCEPTION 'Alternativa inválida'; END IF;
 END LOOP;
 IF cardinality(NEW.candidates)<>(SELECT count(DISTINCT x) FROM unnest(NEW.candidates) x) THEN RAISE EXCEPTION 'Alternativas duplicadas'; END IF;
 IF auth.uid() IS NOT NULL THEN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Solo administración'; END IF;
  IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid(); END IF;
  NEW.updated_by:=auth.uid(); NEW.recorded_by:='Administración';
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER choice_survey_admin_guard BEFORE INSERT OR UPDATE ON public.event_choice_survey_admin_entries FOR EACH ROW EXECUTE FUNCTION public.choice_survey_admin_guard();
CREATE FUNCTION public.choice_survey_admin_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.event_choice_survey_admin_log(entry_id,actor_id,recorded_by,action,before_data,after_data) VALUES(NEW.id,auth.uid(),NEW.recorded_by,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER choice_survey_admin_audit AFTER INSERT OR UPDATE ON public.event_choice_survey_admin_entries FOR EACH ROW EXECUTE FUNCTION public.choice_survey_admin_audit();
REVOKE ALL ON FUNCTION public.choice_survey_admin_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.choice_survey_admin_audit() FROM PUBLIC;