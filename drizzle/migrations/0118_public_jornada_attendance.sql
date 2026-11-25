-- Free public activities are isolated from commercial events and accounting.
CREATE TABLE public.public_jornadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
  title text NOT NULL,
  activity_date date NOT NULL,
  capacity integer NOT NULL DEFAULT 20 CHECK (capacity > 0),
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.public_jornadas TO authenticated;
GRANT ALL ON public.public_jornadas TO service_role;
ALTER TABLE public.public_jornadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY jornada_admin_read ON public.public_jornadas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.public_jornada_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id uuid NOT NULL REFERENCES public.public_jornadas(id),
  alumno_id uuid REFERENCES public.alumnos(id),
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 100),
  last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 100),
  phone text NOT NULL CHECK (phone ~ '^[1-9][0-9]{7,14}$'),
  token_hash text UNIQUE NOT NULL,
  response text NOT NULL CHECK (response IN ('voy','no_voy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(jornada_id,phone)
);
CREATE UNIQUE INDEX jornada_unique_alumno ON public.public_jornada_attendees(jornada_id,alumno_id) WHERE alumno_id IS NOT NULL;
GRANT SELECT ON public.public_jornada_attendees TO authenticated;
GRANT ALL ON public.public_jornada_attendees TO service_role;
ALTER TABLE public.public_jornada_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY jornada_attendee_admin_read ON public.public_jornada_attendees FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()));

CREATE FUNCTION public.jornada_normalize_phone(p_phone text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE p text;
BEGIN
 IF p_phone IS NULL OR length(p_phone)>40 OR p_phone !~ '^\+?[0-9 ().-]+$' THEN RAISE EXCEPTION 'WhatsApp inválido'; END IF;
 p:=regexp_replace(p_phone,'[^0-9]','','g');
 IF left(p,2)='00' THEN p:=substr(p,3); END IF;
 IF length(p)=10 THEN p:='549'||p; END IF;
 IF length(p)=12 AND left(p,2)='54' THEN p:='549'||substr(p,3); END IF;
 IF p !~ '^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'WhatsApp inválido'; END IF;
 RETURN p;
END $$;

CREATE FUNCTION public.jornada_capacity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.public_jornadas;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.jornada_id IS DISTINCT FROM OLD.jornada_id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash) THEN
   RAISE EXCEPTION 'Identidad inmutable';
 END IF;
 SELECT * INTO j FROM public.public_jornadas WHERE id=NEW.jornada_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jornada inexistente'; END IF;
 NEW.phone:=public.jornada_normalize_phone(NEW.phone);
 IF NEW.response='voy' AND (TG_OP='INSERT' OR OLD.response IS DISTINCT FROM 'voy') THEN
   IF NOT j.is_open THEN RAISE EXCEPTION 'Inscripción cerrada'; END IF;
   IF (SELECT count(*) FROM public.public_jornada_attendees WHERE jornada_id=j.id AND response='voy' AND id<>NEW.id)>=j.capacity THEN
     RAISE EXCEPTION 'Cupos completos';
   END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
CREATE TRIGGER jornada_capacity BEFORE INSERT OR UPDATE ON public.public_jornada_attendees
FOR EACH ROW EXECUTE FUNCTION public.jornada_capacity_guard();

CREATE FUNCTION public.get_public_jornada(p_slug text, p_token text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.public_jornadas; a public.public_jornada_attendees; own_alumno uuid;
BEGIN
 SELECT * INTO j FROM public.public_jornadas WHERE slug=p_slug;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jornada inexistente'; END IF;
 IF auth.uid() IS NOT NULL THEN SELECT id INTO own_alumno FROM public.alumnos WHERE user_id=auth.uid() LIMIT 1; END IF;
 SELECT * INTO a FROM public.public_jornada_attendees WHERE jornada_id=j.id AND
   ((p_token ~ '^[a-f0-9]{64}$' AND token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) OR alumno_id=own_alumno) LIMIT 1;
 RETURN jsonb_build_object('title',j.title,'date',j.activity_date,'capacity',j.capacity,'is_open',j.is_open,
   'confirmed',(SELECT count(*) FROM public.public_jornada_attendees WHERE jornada_id=j.id AND response='voy'),
   'own',CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('first_name',a.first_name,'last_name',a.last_name,'phone',a.phone,'response',a.response) END);
END $$;
REVOKE ALL ON FUNCTION public.get_public_jornada(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_jornada(text,text) TO anon,authenticated;

CREATE FUNCTION public.submit_public_jornada(p_slug text,p_token text,p_first_name text,p_last_name text,p_phone text,p_response text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.public_jornadas; a public.public_jornada_attendees; own_alumno uuid; h text; phone_normal text;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Enlace personal inválido'; END IF;
 IF p_response IS NULL OR p_response NOT IN ('voy','no_voy') THEN RAISE EXCEPTION 'Elegí una respuesta'; END IF;
 IF p_first_name IS NULL OR p_last_name IS NULL OR length(btrim(p_first_name)) NOT BETWEEN 1 AND 100 OR length(btrim(p_last_name)) NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Completá nombre y apellido';
 END IF;
 phone_normal:=public.jornada_normalize_phone(p_phone);
 h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 -- One mutex for the whole pool, acquired before lookup/count/write.
 SELECT * INTO j FROM public.public_jornadas WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Jornada inexistente'; END IF;
 IF auth.uid() IS NOT NULL THEN SELECT id INTO own_alumno FROM public.alumnos WHERE user_id=auth.uid() LIMIT 1; END IF;
 SELECT * INTO a FROM public.public_jornada_attendees WHERE jornada_id=j.id AND (token_hash=h OR alumno_id=own_alumno) LIMIT 1;
 IF a.id IS NOT NULL THEN
   IF a.alumno_id IS NOT NULL AND own_alumno IS NOT NULL AND a.alumno_id<>own_alumno THEN RAISE EXCEPTION 'Enlace de otra persona'; END IF;
   UPDATE public.public_jornada_attendees SET response=p_response WHERE id=a.id;
 ELSE
   IF EXISTS(SELECT 1 FROM public.public_jornada_attendees WHERE jornada_id=j.id AND phone=phone_normal) THEN
     RAISE EXCEPTION 'Ese WhatsApp ya está registrado. Usá tu enlace personal o consultá a la organización.';
   END IF;
   INSERT INTO public.public_jornada_attendees(jornada_id,alumno_id,first_name,last_name,phone,token_hash,response)
   VALUES(j.id,own_alumno,btrim(p_first_name),btrim(p_last_name),phone_normal,h,p_response);
 END IF;
 RETURN public.get_public_jornada(p_slug,p_token);
END $$;
REVOKE ALL ON FUNCTION public.submit_public_jornada(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_jornada(text,text,text,text,text,text) TO anon,authenticated;

CREATE FUNCTION public.admin_public_jornada_report(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 SELECT jsonb_build_object('jornada',public.get_public_jornada(p_slug), 'attendees',coalesce(jsonb_agg(
 jsonb_build_object('id',a.id,'first_name',a.first_name,'last_name',a.last_name,'phone',a.phone,'response',a.response,'alumno_id',a.alumno_id,'updated_at',a.updated_at)
 ORDER BY a.created_at) FILTER(WHERE a.id IS NOT NULL),'[]'::jsonb)) INTO result
 FROM public.public_jornadas j LEFT JOIN public.public_jornada_attendees a ON a.jornada_id=j.id WHERE j.slug=p_slug;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_public_jornada_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_public_jornada_report(text) TO authenticated;
