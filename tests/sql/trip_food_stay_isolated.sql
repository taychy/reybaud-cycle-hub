-- Dedicated empty LOCAL database only, no production IDs or writes.
\set ON_ERROR_STOP on
DO $$ BEGIN IF to_regclass('public.events') IS NOT NULL THEN RAISE EXCEPTION 'Requires empty isolated database'; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TYPE app_role AS ENUM ('admin');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION current_alumno_id() RETURNS uuid LANGUAGE sql AS $$ SELECT auth.uid() $$;
CREATE TABLE events(id uuid PRIMARY KEY,date date,end_date date,metadata jsonb);
CREATE TABLE event_reservations(id uuid PRIMARY KEY,event_id uuid,package_id uuid,alumno_id uuid,access_token text,reservation_status text);
CREATE TABLE event_packages(id uuid PRIMARY KEY,event_id uuid,incluye_gastronomia boolean);
CREATE TABLE event_rescheduling_campaigns(event_id uuid);
CREATE TABLE reservation_rescheduling_requests(reservation_id uuid,event_id uuid,choice text,review_status text,snapshot jsonb);
CREATE TABLE event_addons(id uuid,event_id uuid,activo boolean,precio numeric,aplica_a_paquetes uuid[]);
CREATE TABLE reservation_addons(reservation_id uuid,addon_id uuid,notas text);
CREATE TABLE reservation_checklist_data(reservation_id uuid,step_key text,data jsonb,completed boolean,updated_at timestamptz);
\i /dev-server/drizzle/migrations/0095_trip_food_stay_event_validation.sql
CREATE TRIGGER guard BEFORE INSERT OR UPDATE ON reservation_checklist_data FOR EACH ROW EXECUTE FUNCTION trip_food_survey_guard();
INSERT INTO events VALUES('10000000-0000-0000-0000-000000000001','2026-10-22','2026-10-25','{"food_survey":{"meal_program":{"almuerzo_addon_id":"30000000-0000-0000-0000-000000000001","cena_addon_id":"30000000-0000-0000-0000-000000000002","meals":[{"fecha":"2026-11-05","tipo":"cena"},{"fecha":"2026-11-06","tipo":"almuerzo"},{"fecha":"2026-11-08","tipo":"cena"},{"fecha":"2026-11-09","tipo":"almuerzo"},{"fecha":"2026-11-06","tipo":"desayuno"}]}}}');
INSERT INTO event_packages VALUES('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',false);
INSERT INTO event_addons VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,35000,null),('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',true,35000,null);
INSERT INTO event_rescheduling_campaigns VALUES('10000000-0000-0000-0000-000000000001');
INSERT INTO event_reservations SELECT ('40000000-0000-0000-0000-00000000000'||i)::uuid,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','fixture-token-'||i,'reserva_confirmada' FROM generate_series(1,4) i;
INSERT INTO reservation_rescheduling_requests VALUES
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','attend_5_9','validada','{"option":{"value":"attend_5_9","start":"2026-11-05","end":"2026-11-09"}}'),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','attend_5_8','validada','{"option":{"value":"attend_5_8","start":"2026-11-05","end":"2026-11-08"}}'),
('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','attend_6_9','validada','{"option":{"value":"attend_6_9","start":"2026-11-06","end":"2026-11-09"}}');
CREATE FUNCTION assert_true(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
CREATE FUNCTION save_fixture(r uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE d jsonb; BEGIN
DELETE FROM reservation_checklist_data WHERE reservation_id=r;
INSERT INTO reservation_checklist_data VALUES(r,'gastronomia','{"tipo_alimentacion":"normal","tiene_alergias":false,"comidas_solicitadas":[{"fecha":"2026-11-05","tipo":"cena"},{"fecha":"2026-11-06","tipo":"almuerzo"},{"fecha":"2026-11-06","tipo":"almuerzo"},{"fecha":"2026-11-08","tipo":"cena"},{"fecha":"2026-11-09","tipo":"almuerzo"},{"fecha":"2026-11-06","tipo":"desayuno"}]}',true,now()) RETURNING data->'comidas_solicitadas' INTO d; RETURN d; END $$;
SELECT assert_true(jsonb_array_length(save_fixture('40000000-0000-0000-0000-000000000001'))=4,'5–9 only four real services, no breakfast/duplicate');
SELECT assert_true(jsonb_array_length(save_fixture('40000000-0000-0000-0000-000000000002'))=3,'5–8 excludes 9');
SELECT assert_true(jsonb_array_length(save_fixture('40000000-0000-0000-0000-000000000003'))=3,'6–9 excludes 5');
SELECT assert_true(save_fixture('40000000-0000-0000-0000-000000000004')='[]','no validated dates no offer');
UPDATE event_addons SET event_id='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT assert_true(jsonb_array_length(save_fixture('40000000-0000-0000-0000-000000000001'))=2,'foreign-event lunches rejected');
UPDATE event_addons SET event_id='10000000-0000-0000-0000-000000000001';
UPDATE event_packages SET incluye_gastronomia=true;
SELECT assert_true(save_fixture('40000000-0000-0000-0000-000000000001')='[]','included full board never requested');
UPDATE event_packages SET incluye_gastronomia=false;
INSERT INTO reservation_addons VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','Cena 2026-11-05');
SELECT assert_true(jsonb_array_length(save_fixture('40000000-0000-0000-0000-000000000001'))=3,'existing dated dinner excluded');
UPDATE reservation_addons SET notas=null;
SELECT assert_true(jsonb_array_length(save_fixture('40000000-0000-0000-0000-000000000001'))=2,'undated contracted dinners blocked conservatively');
SELECT assert_true((SELECT count(*) FROM reservation_addons)=1,'survey never purchases Extras');
UPDATE event_addons SET aplica_a_paquetes=ARRAY['20000000-0000-0000-0000-000000000002'::uuid];
SELECT assert_true(save_fixture('40000000-0000-0000-0000-000000000001')='[]','Extra restricted to another package rejected');
SELECT assert_true(get_trip_food_stay('40000000-0000-0000-0000-000000000001','fixture-token-1')->>'start'='2026-11-05','personal token resolves own stay');
DO $$ BEGIN BEGIN PERFORM get_trip_food_stay('40000000-0000-0000-0000-000000000002','fixture-token-1'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS token cannot read another stay'; RETURN; END; RAISE EXCEPTION 'FAIL token leakage'; END $$;
UPDATE reservation_rescheduling_requests SET review_status='pendiente' WHERE reservation_id='40000000-0000-0000-0000-000000000001';
SELECT assert_true(_trip_food_stay('40000000-0000-0000-0000-000000000001') IS NULL,'pending request never substitutes historical dates');