-- Disposable local database ONLY.
DO $$ BEGIN
 BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
 BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
 BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE TYPE public.app_role AS ENUM ('admin','alumno','coach','deposito');
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
CREATE TABLE public.alumnos(id uuid PRIMARY KEY,user_id uuid,nombre text,apellido text,telefono text);
INSERT INTO public.alumnos VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Alumno','QA','5491199999999');
INSERT INTO public.user_roles VALUES ('33333333-3333-3333-3333-333333333333','admin');