DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM('admin','alumno');
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.events(id uuid PRIMARY KEY);
CREATE TABLE public.event_packages(id uuid PRIMARY KEY,event_id uuid,nombre text);
CREATE TABLE public.event_enrollment_requests(id uuid PRIMARY KEY,event_id uuid,package_id uuid,status text,hotel_validated boolean,approved_unit_price numeric,people_count integer,attendees jsonb,email text);
CREATE TABLE public.event_enrollment_request_history(request_id uuid,actor_user_id uuid,action text,from_status text,to_status text,review_note text,details jsonb);
CREATE TABLE public.event_reservations(id uuid PRIMARY KEY,event_id uuid);
INSERT INTO public.events VALUES('408a8eb8-fb62-4a50-ad6d-040bd5716797'),('5380df24-6bbf-4d25-81cd-a1ab2b41bd94');
INSERT INTO public.event_packages VALUES
 ('00000000-0000-4000-8000-000000000010','408a8eb8-fb62-4a50-ad6d-040bd5716797','Individual'),
 ('00000000-0000-4000-8000-000000000020','5380df24-6bbf-4d25-81cd-a1ab2b41bd94','Individual'),
 ('00000000-0000-4000-8000-000000000030','408a8eb8-fb62-4a50-ad6d-040bd5716797','Cabaña con comidas'),
 ('00000000-0000-4000-8000-000000000040','5380df24-6bbf-4d25-81cd-a1ab2b41bd94','Cabaña sin comidas'),
 ('00000000-0000-4000-8000-000000000050','408a8eb8-fb62-4a50-ad6d-040bd5716797','Doble'),
 ('00000000-0000-4000-8000-000000000060','5380df24-6bbf-4d25-81cd-a1ab2b41bd94','Doble');
CREATE FUNCTION public.qa_request(i integer,p uuid,n integer) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE r uuid:=md5(i::text)::uuid; BEGIN
 INSERT INTO public.event_enrollment_requests SELECT r,event_id,id,'aprobada_cotizacion',true,1950000,n,'[]'::jsonb,'qa'||i||'@example.invalid' FROM public.event_packages WHERE id=p; RETURN r; END $$;
