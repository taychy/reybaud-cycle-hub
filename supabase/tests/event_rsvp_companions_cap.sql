-- Run only against a disposable empty PostgreSQL database; no production data.
\set ON_ERROR_STOP on
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','alumno','coach','deposito');
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'false')='true' $$;
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.alumnos(id uuid PRIMARY KEY);
CREATE TABLE public.audit_log(user_id uuid,user_email text,user_role text,action text,entity_type text,entity_id text,details jsonb);
CREATE TABLE public.events(id uuid PRIMARY KEY,title text,metadata jsonb);
\i sql/pending/0113_event_rsvp_lunch.sql
\i sql/pending/0114_event_rsvp_companions_cap.sql
-- idempotencia
\i sql/pending/0114_event_rsvp_companions_cap.sql
INSERT INTO public.events VALUES ('00000000-0000-0000-0000-000000000001','Fixture','{"rsvp_enabled":"true"}');
INSERT INTO public.event_rsvp_settings(event_id,adult_price,child_4_9_price,under_4_price,prices_confirmed_at)
  VALUES ('00000000-0000-0000-0000-000000000001',40000,20000,0,now());
INSERT INTO public.event_rsvp_invites(event_id,recipient_email,token)
  VALUES ('00000000-0000-0000-0000-000000000001','a@test.local','00000000-0000-0000-0000-0000000000aa');
-- 31+ acompañantes ahora se aceptan
SELECT public.respond_event_rsvp('00000000-0000-0000-0000-0000000000aa','voy','solo_almuerzo',45);
SELECT public.confirm_event_rsvp_lunch('00000000-0000-0000-0000-0000000000aa',40,5,1);
DO $$ BEGIN
  IF (SELECT guests_count FROM public.event_rsvp_invites) <> 45 THEN RAISE EXCEPTION 'guests not saved'; END IF;
  IF (SELECT lunch_status FROM public.event_rsvp_invites) <> 'instrucciones_pendientes' THEN RAISE EXCEPTION 'status changed'; END IF;
  IF (SELECT terms_version FROM public.event_rsvp_invites) <> 'fondazo-almuerzo-v2-2026-11-17'
    OR (SELECT terms_text_snapshot FROM public.event_rsvp_invites) NOT LIKE '%viernes 27/11/2026 inclusive%' THEN
    RAISE EXCEPTION 'current cancellation policy not accepted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_rsvp_lunch_audit) THEN RAISE EXCEPTION 'audit missing'; END IF;
END $$;
-- máximo técnico: 500 ok, 501 rechazado; 501 comensales ok, 502 rechazado
SELECT public.respond_event_rsvp('00000000-0000-0000-0000-0000000000aa','voy','solo_almuerzo',500);
SELECT public.confirm_event_rsvp_lunch('00000000-0000-0000-0000-0000000000aa',501,0,0);
DO $$ BEGIN
  BEGIN PERFORM public.respond_event_rsvp('00000000-0000-0000-0000-0000000000aa','voy','solo_almuerzo',501); RAISE EXCEPTION 'test failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'Cantidad de acompañantes inválida.' THEN RAISE; END IF; END;
  BEGIN PERFORM public.confirm_event_rsvp_lunch('00000000-0000-0000-0000-0000000000aa',500,1,1); RAISE EXCEPTION 'test failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'Revisá las cantidades de comensales.' THEN RAISE; END IF; END;
  BEGIN UPDATE public.event_rsvp_invites SET adults_count=502; RAISE EXCEPTION 'test failed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.respond_event_rsvp('00000000-0000-0000-0000-0000000000bb','voy','solo_almuerzo',1); RAISE EXCEPTION 'test failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'Enlace no encontrado.' THEN RAISE; END IF; END;
END $$;
-- permisos: sin PUBLIC, solo roles de la app; tabla sin acceso directo para anon
DO $$ BEGIN
  IF has_function_privilege('public','public.respond_event_rsvp(uuid,text,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'public exec'; END IF;
  IF NOT has_function_privilege('anon','public.confirm_event_rsvp_lunch(uuid,integer,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'anon exec missing'; END IF;
  IF has_table_privilege('anon','public.event_rsvp_invites','SELECT') THEN RAISE EXCEPTION 'anon table read'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.event_rsvp_invites'::regclass) THEN RAISE EXCEPTION 'rls off'; END IF;
END $$;
SELECT 'PASS: 31+, technical max 500/501, idempotent, token, status, audit, grants, RLS' AS result;
