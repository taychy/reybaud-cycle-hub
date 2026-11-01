-- Run only against a disposable empty PostgreSQL database; no production data.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','alumno','coach','deposito');
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'false')='true' $$;
CREATE FUNCTION public.current_alumno_id() RETURNS uuid LANGUAGE sql AS $$ SELECT auth.uid() $$;
CREATE TABLE public.events(id uuid PRIMARY KEY,title text,metadata jsonb);
CREATE TABLE public.event_packages(id uuid PRIMARY KEY,event_id uuid,incluye_gastronomia boolean);
CREATE TABLE public.event_reservations(id uuid PRIMARY KEY,event_id uuid,package_id uuid,alumno_id uuid,reservation_status text);
CREATE TABLE public.event_addons(id uuid PRIMARY KEY,event_id uuid,precio numeric,categoria text,activo boolean,updated_at timestamptz,aplica_a_paquetes uuid[]);
CREATE TABLE public.reservation_addons(reservation_id uuid,addon_id uuid,notas text);
CREATE TABLE public.reservation_checklist_data(reservation_id uuid,alumno_id uuid,step_key text,data jsonb,completed boolean,updated_at timestamptz, UNIQUE(reservation_id,step_key));
CREATE FUNCTION public._trip_food_stay(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public._food_program_bounds(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"start":"2026-11-05","end":"2026-11-09"}'::jsonb $$;
\i drizzle/migrations/0101_food_preferences_independent_activation.sql
CREATE TRIGGER survey_guard BEFORE INSERT OR UPDATE ON public.reservation_checklist_data FOR EACH ROW EXECUTE FUNCTION public.trip_food_survey_guard();
INSERT INTO public.events VALUES ('00000000-0000-0000-0000-000000000001','Fixture',NULL);
INSERT INTO public.event_packages VALUES ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',false);
INSERT INTO public.event_reservations VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','reserva_confirmada');
SELECT set_config('test.admin','true',false);
SELECT public.admin_set_food_survey_enabled('00000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
  BEGIN PERFORM public.admin_enable_food_meals('00000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'test failed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'servicio_sin_decidir%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('test.admin','false',false),set_config('test.uid','00000000-0000-0000-0000-000000000004',false);
DO $$ DECLARE mode text; n int; BEGIN
FOREACH mode IN ARRAY ARRAY['todas','individual','ninguna'] LOOP
INSERT INTO public.reservation_checklist_data VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','gastronomia',jsonb_build_object('tipo_alimentacion','vegana','tiene_alergias',true,'alergias_detalle','frutos secos','comidas_interes_modo',mode,'comidas_solicitadas',jsonb_build_array(jsonb_build_object('fecha','2026-11-05','tipo','cena'))),true,now()) ON CONFLICT(reservation_id,step_key) DO UPDATE SET data=EXCLUDED.data;
IF NOT EXISTS(SELECT 1 FROM public.reservation_checklist_data WHERE data->>'comidas_interes_modo'=mode AND data->'comidas_solicitadas'='[]'::jsonb) THEN RAISE EXCEPTION 'interest failed'; END IF;
END LOOP;
SELECT count(*) INTO n FROM public.reservation_checklist_data; IF n<>1 THEN RAISE EXCEPTION 'duplicate'; END IF;
IF public.get_my_trip_food_survey('00000000-0000-0000-0000-000000000001') IS NULL THEN RAISE EXCEPTION 'owner lookup'; END IF;
BEGIN UPDATE public.reservation_checklist_data SET data='{"comidas_interes_modo":"comprar"}'; RAISE EXCEPTION 'test failed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'comidas_interes_modo_invalido' THEN RAISE; END IF; END;
END $$;
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000005',false);
DO $$ BEGIN
IF public.get_my_trip_food_survey('00000000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'owner leak'; END IF;
BEGIN UPDATE public.reservation_checklist_data SET data='{}'; RAISE EXCEPTION 'test failed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'No autorizado' THEN RAISE; END IF; END;
END $$;
-- Token path: trusted existing edge function uses service role, auth.uid() NULL.
SELECT set_config('test.uid','',false);
UPDATE public.reservation_checklist_data SET data='{"tipo_alimentacion":"normal","tiene_alergias":false,"comidas_interes_modo":"todas"}';
UPDATE public.event_packages SET incluye_gastronomia=true;
UPDATE public.reservation_checklist_data SET data='{"tipo_alimentacion":"normal","tiene_alergias":false,"comidas_interes_modo":"todas"}';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.reservation_checklist_data WHERE data->>'comidas_interes_modo' IS NOT NULL) THEN RAISE EXCEPTION 'pension duplicated'; END IF; END $$;
UPDATE public.event_reservations SET reservation_status='cancelada';
DO $$ BEGIN BEGIN UPDATE public.reservation_checklist_data SET data='{}'; RAISE EXCEPTION 'test failed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reserva_no_activa' THEN RAISE; END IF; END; END $$;
SELECT 'PASS: preferences, three modes, idempotence, ownership, token path, included meals, cancelled, pending program' AS result;