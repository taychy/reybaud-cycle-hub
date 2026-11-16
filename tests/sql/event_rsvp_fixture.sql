-- Esquema mínimo desechable. Nunca ejecutar contra Lovable Cloud.
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TYPE public.app_role AS ENUM ('admin', 'alumno', 'coach', 'deposito');
CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
CREATE TABLE public.admin_profiles (user_id uuid, role text);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_profiles WHERE user_id=_user_id AND role='super_admin');
$$;
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, user_email text,
  user_role text NOT NULL, action text NOT NULL, entity_type text NOT NULL,
  entity_id text, details jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.events (id uuid PRIMARY KEY, title text, date date, location text, metadata jsonb);
CREATE TABLE public.alumnos (id uuid PRIMARY KEY, nombre text, email text);
INSERT INTO public.events VALUES ('08fc7e07-10df-4ace-b3ed-a0d581b6f7c9', 'Fondazo', '2026-11-29', 'La Carreta del Gato', '{"rsvp_enabled":true}');
INSERT INTO public.alumnos VALUES ('11111111-1111-1111-1111-111111111111', 'Prueba', 'prueba@example.com');
INSERT INTO auth.users VALUES ('22222222-2222-2222-2222-222222222222', 'admin@example.com');
INSERT INTO public.user_roles VALUES ('22222222-2222-2222-2222-222222222222', 'admin');
