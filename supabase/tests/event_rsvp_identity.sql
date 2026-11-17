-- Run only against a disposable empty PostgreSQL database; never production.
\set ON_ERROR_STOP on
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','alumno','coach','deposito');
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean AS $$ SELECT false $$ LANGUAGE sql;
CREATE TABLE public.alumnos(
  id uuid PRIMARY KEY,nombre text NOT NULL,apellido text,email text NOT NULL,
  telefono text,user_id uuid
);
CREATE TABLE public.audit_log(user_id uuid,user_email text,user_role text,action text,entity_type text,entity_id text,details jsonb);
CREATE TABLE public.events(
  id uuid PRIMARY KEY,title text,date date,location text,metadata jsonb,
  status text,estado_publicacion text,visible_to_students boolean,is_active boolean
);
\i sql/pending/0113_event_rsvp_lunch.sql
\i sql/pending/0114_event_rsvp_companions_cap.sql
\i sql/pending/0115_event_rsvp_identity.sql
-- Idempotencia de toda la migración.
\i sql/pending/0115_event_rsvp_identity.sql

INSERT INTO public.events VALUES (
  '00000000-0000-0000-0000-000000000001','Fixture','2026-11-29','Prueba',
  '{"rsvp_enabled":"true","event_nature":"propio_informativo"}',
  'publicado','publicado',true,true
);
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-0000000000b1','maria@test.local',now()),
  ('00000000-0000-0000-0000-0000000000b2','solo-email@test.local',now());
INSERT INTO public.alumnos VALUES
  ('00000000-0000-0000-0000-0000000000a1','María','Pérez','maria@test.local','+5491111111111','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000a2','No','Vincular','solo-email@test.local',NULL,NULL);
INSERT INTO public.event_rsvp_invites(event_id,alumno_id,recipient_email,recipient_name,token) VALUES
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','maria@test.local','Nombre anterior','00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000001',NULL,'visitante@test.local',NULL,'00000000-0000-0000-0000-0000000000bb');

DO $$
DECLARE
  v_status jsonb;
  v_token uuid;
BEGIN
  -- El token vinculado devuelve el perfil por alumno_id, no el texto del cliente.
  v_status := public.get_event_rsvp_by_token('00000000-0000-0000-0000-0000000000aa');
  IF v_status->'identity'->>'linked' <> 'true'
    OR v_status->'identity'->>'first_name' <> 'María'
    OR v_status->'identity'->>'last_name' <> 'Pérez'
    OR v_status->'identity'->>'email' <> 'maria@test.local' THEN
    RAISE EXCEPTION 'linked identity mismatch: %',v_status;
  END IF;

  PERFORM public.respond_event_rsvp_with_guest_types(
    '00000000-0000-0000-0000-0000000000aa','voy','solo_fondo','[]','[]',
    '{"first_name":"Identidad","last_name":"Falsa","whatsapp":"+5491199999999","alumno_id":"00000000-0000-0000-0000-0000000000a2"}'
  );
  IF NOT EXISTS(SELECT 1 FROM public.event_rsvp_invites
    WHERE token='00000000-0000-0000-0000-0000000000aa'
      AND alumno_id='00000000-0000-0000-0000-0000000000a1'
      AND participant_first_name='María' AND participant_last_name='Pérez'
      AND recipient_name='María Pérez') THEN
    RAISE EXCEPTION 'client replaced linked identity';
  END IF;

  -- Un visitante no puede responder sin datos ni con WhatsApp inválido.
  BEGIN
    PERFORM public.respond_event_rsvp_with_guest_types(
      '00000000-0000-0000-0000-0000000000bb','no_voy',NULL,'[]','[]',NULL
    );
    RAISE EXCEPTION 'visitor without identity accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Completá tu nombre y apellido.' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.respond_event_rsvp_with_guest_types(
      '00000000-0000-0000-0000-0000000000bb','no_voy',NULL,'[]','[]',
      '{"first_name":"Ana","last_name":"Visitante","whatsapp":"11 1234 5678"}'
    );
    RAISE EXCEPTION 'invalid visitor phone accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Ingresá tu WhatsApp%' THEN RAISE; END IF;
  END;

  PERFORM public.respond_event_rsvp_with_guest_types(
    '00000000-0000-0000-0000-0000000000bb','no_voy',NULL,'[]','[]',
    '{"first_name":"Ana","last_name":"Visitante","whatsapp":"+54 9 11 1234-5678","alumno_id":"00000000-0000-0000-0000-0000000000a1"}'
  );
  IF NOT EXISTS(SELECT 1 FROM public.event_rsvp_invites
    WHERE token='00000000-0000-0000-0000-0000000000bb'
      AND alumno_id IS NULL AND response='no_voy' AND guests_count=0
      AND participant_first_name='Ana' AND participant_last_name='Visitante'
      AND participant_whatsapp='+5491112345678' AND lunch_status='sin_interes') THEN
    RAISE EXCEPTION 'visitor identity or NO VOY not preserved';
  END IF;
  v_status := public.get_event_rsvp_by_token('00000000-0000-0000-0000-0000000000bb');
  IF v_status->'identity'->>'linked' <> 'false'
    OR v_status->'identity'->>'full_name' <> 'Ana Visitante' THEN
    RAISE EXCEPTION 'visitor status mismatch';
  END IF;

  -- Igualdad de email no basta para asociar una ficha de alumno.
  PERFORM set_config('test.uid','00000000-0000-0000-0000-0000000000b2',false);
  v_token := public.create_or_resume_public_rsvp(
    '00000000-0000-0000-0000-000000000001','Persona','Visitante','+5491122222222'
  );
  IF NOT EXISTS(SELECT 1 FROM public.event_rsvp_invites
    WHERE token=v_token AND alumno_id IS NULL AND participant_first_name='Persona') THEN
    RAISE EXCEPTION 'email guessed an alumno identity';
  END IF;

  -- La recuperación por email verificado conserva la identidad ya vinculada.
  PERFORM set_config('test.uid','00000000-0000-0000-0000-0000000000b1',false);
  v_token := public.create_or_resume_public_rsvp(
    '00000000-0000-0000-0000-000000000001','Otro','Nombre','+5491133333333'
  );
  IF v_token <> '00000000-0000-0000-0000-0000000000aa'
    OR NOT EXISTS(SELECT 1 FROM public.event_rsvp_invites
      WHERE token=v_token AND alumno_id='00000000-0000-0000-0000-0000000000a1'
        AND participant_first_name='María' AND participant_last_name='Pérez') THEN
    RAISE EXCEPTION 'public resume replaced linked identity';
  END IF;

  -- Permisos y acceso directo.
  IF has_function_privilege('public','public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC execute granted';
  END IF;
  IF NOT has_function_privilege('anon','public.respond_event_rsvp_with_guest_types(uuid,text,text,jsonb,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'anon execute missing';
  END IF;
  IF has_function_privilege('anon','public.create_or_resume_public_rsvp(uuid,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.create_or_resume_public_rsvp(uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'public entry grants mismatch';
  END IF;
  IF has_table_privilege('anon','public.event_rsvp_invites','SELECT')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.event_rsvp_invites'::regclass) THEN
    RAISE EXCEPTION 'table access or RLS mismatch';
  END IF;
END $$;

SELECT 'PASS: token/alumno identity, visitor fields, no email guessing, NO VOY, idempotence, grants and RLS' AS result;
