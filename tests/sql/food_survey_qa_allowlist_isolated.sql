-- Run ONLY against a fresh local QA database; never against application data.
CREATE SCHEMA auth;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TYPE public.app_role AS ENUM ('admin','coach');
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.events(id uuid PRIMARY KEY);
\ir ../../drizzle/migrations/0096_private_food_survey_qa.sql
\ir ../../drizzle/migrations/0097_food_qa_owner_allowlist.sql
INSERT INTO public.events VALUES('67b4e85d-b00b-4b74-9644-99458d948c65');
INSERT INTO public.trip_food_survey_qa_access(event_id,owner_id) VALUES
('67b4e85d-b00b-4b74-9644-99458d948c65','d6281cf9-fe3b-467d-b617-746987850d4c'),
('67b4e85d-b00b-4b74-9644-99458d948c65','fac4a969-14f8-4c3e-9990-0f2e7ba0193f');
INSERT INTO public.trip_food_survey_qa(event_id,owner_id,case_key)
SELECT event_id,owner_id,k FROM public.trip_food_survey_qa_access CROSS JOIN (VALUES('con_pension'),('sin_pension')) c(k);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d6281cf9-fe3b-467d-b617-746987850d4c',false);
DO $$ DECLARE q record; d jsonb; BEGIN
 IF NOT public.can_access_trip_food_survey_qa('67b4e85d-b00b-4b74-9644-99458d948c65') THEN RAISE EXCEPTION 'Invited coach blocked'; END IF;
 IF (SELECT count(*) FROM public.trip_food_survey_qa)<>2 THEN RAISE EXCEPTION 'Owner isolation failed'; END IF;
 FOR q IN SELECT id,case_key FROM public.trip_food_survey_qa LOOP
 d:=public.save_trip_food_survey_qa(q.id,'{"tipo_alimentacion":"vegana","tiene_alergias":true,"alergias_detalle":"QA frutos secos","contaminacion_cruzada":true}'::jsonb);
 IF d->>'tipo_alimentacion'<>'vegana' OR d->>'desayuno_incluido'<>'true' OR d->'comidas_solicitadas'<>'[]'::jsonb OR (d->>'pension_incluida')::boolean<>(q.case_key='con_pension') THEN RAISE EXCEPTION 'Stored rules failed'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.trip_food_survey_qa WHERE response->>'tipo_alimentacion'='vegana')<>2 THEN RAISE EXCEPTION 'Readback failed'; END IF;
END $$;
RESET ROLE;
-- Strict rejection of another owner's known case.
SELECT set_config('qa.other_id',(SELECT id::text FROM public.trip_food_survey_qa WHERE owner_id='fac4a969-14f8-4c3e-9990-0f2e7ba0193f' LIMIT 1),false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.save_trip_food_survey_qa(current_setting('qa.other_id')::uuid,'{"tipo_alimentacion":"normal","tiene_alergias":false}'::jsonb); RAISE EXCEPTION 'Third-party save allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Third-party save allowed' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','fac4a969-14f8-4c3e-9990-0f2e7ba0193f',false);
DO $$ DECLARE q record; BEGIN
 IF (SELECT count(*) FROM public.trip_food_survey_qa)<>2 THEN RAISE EXCEPTION 'Claudio isolation failed'; END IF;
 FOR q IN SELECT id FROM public.trip_food_survey_qa LOOP PERFORM public.save_trip_food_survey_qa(q.id,'{"tipo_alimentacion":"normal","tiene_alergias":false}'); END LOOP;
 IF (SELECT count(*) FROM public.trip_food_survey_qa WHERE response->>'tipo_alimentacion'='normal')<>2 THEN RAISE EXCEPTION 'Claudio persistence failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
DO $$ BEGIN IF public.can_access_trip_food_survey_qa('67b4e85d-b00b-4b74-9644-99458d948c65') OR (SELECT count(*) FROM public.trip_food_survey_qa)<>0 THEN RAISE EXCEPTION 'Non-invited account allowed'; END IF; END $$;
RESET ROLE;
UPDATE public.trip_food_survey_qa_access SET active=false WHERE owner_id='d6281cf9-fe3b-467d-b617-746987850d4c';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d6281cf9-fe3b-467d-b617-746987850d4c',false);
DO $$ BEGIN IF public.can_access_trip_food_survey_qa('67b4e85d-b00b-4b74-9644-99458d948c65') OR (SELECT count(*) FROM public.trip_food_survey_qa)<>0 THEN RAISE EXCEPTION 'Revocation failed'; END IF; END $$;
RESET ROLE;
SELECT 'PASS: both laboral owners, coach without admin, save/readback, no meals, third party denied, uninvited denied, revocation' AS result;