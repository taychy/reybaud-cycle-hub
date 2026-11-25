BEGIN;
INSERT INTO public.public_jornadas(slug,title,activity_date,capacity) VALUES ('qa','QA','2026-11-28',20);
DO $$
DECLARE s jsonb; i integer; n integer;
BEGIN
 s:=public.get_public_jornada('qa',repeat('a',64));
 IF s->'own'<>'null'::jsonb OR (s->>'confirmed')::int<>0 THEN RAISE EXCEPTION 'Unregistered GET'; END IF;
 FOR i IN 1..19 LOOP
  PERFORM public.submit_public_jornada('qa',lpad(to_hex(i),64,'0'),'Persona','QA','54911'||lpad(i::text,8,'0'),'voy');
 END LOOP;
 s:=public.get_public_jornada('qa');
 IF (s->>'confirmed')::int<>19 THEN RAISE EXCEPTION 'Expected 19'; END IF;
 s:=public.submit_public_jornada('qa',repeat('a',64),'Última','QA','+54 11 9999-9998','voy');
 IF (s->>'confirmed')::int<>20 THEN RAISE EXCEPTION 'Expected 20'; END IF;
 PERFORM public.submit_public_jornada('qa',repeat('a',64),'Última','QA','+54 9 11 9999-9998','voy');
 SELECT count(*) INTO n FROM public.public_jornada_attendees WHERE jornada_id=(SELECT id FROM public.public_jornadas WHERE slug='qa');
 IF n<>20 THEN RAISE EXCEPTION 'Double click created duplicate'; END IF;
 BEGIN
  PERFORM public.submit_public_jornada('qa',repeat('b',64),'Overflow','QA','5491199999997','voy');
  RAISE EXCEPTION '21st seat allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Cupos completos' THEN RAISE; END IF; END;
 s:=public.submit_public_jornada('qa',repeat('c',64),'No','Voy','5491199999996','no_voy');
 IF (s->>'confirmed')::int<>20 THEN RAISE EXCEPTION 'No voy consumed seat'; END IF;
 BEGIN
  PERFORM public.submit_public_jornada('qa',repeat('d',64),'Duplicate','QA','+54 9 11 9999-9998','no_voy');
  RAISE EXCEPTION 'Phone duplicate accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Ese WhatsApp ya está registrado.%' THEN RAISE; END IF; END;
 s:=public.submit_public_jornada('qa',repeat('a',64),'Última','QA','5491199999998','no_voy');
 IF (s->>'confirmed')::int<>19 OR s->'own'->>'response'<>'no_voy' THEN RAISE EXCEPTION 'Cancel did not release'; END IF;
 s:=public.submit_public_jornada('qa',repeat('b',64),'New','QA','5491199999997','voy');
 IF (s->>'confirmed')::int<>20 THEN RAISE EXCEPTION 'Released seat not reusable'; END IF;
 IF public.get_public_jornada('qa',repeat('e',64))->'own'<>'null'::jsonb THEN RAISE EXCEPTION 'Wrong token leaked identity'; END IF;
END $$;
-- Real permissions, not only security-definer simulations.
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF public.get_public_jornada('qa')->'own'<>'null'::jsonb THEN RAISE EXCEPTION 'Anonymous names leak'; END IF;
 BEGIN PERFORM * FROM public.public_jornada_attendees; RAISE EXCEPTION 'Anon SELECT allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_public_jornada_report('qa'); RAISE EXCEPTION 'Anon report allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.public_jornada_attendees SET response='voy'; RAISE EXCEPTION 'Direct UPDATE allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF jsonb_array_length(public.admin_public_jornada_report('qa')->'attendees')<>22 THEN RAISE EXCEPTION 'Admin count'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
INSERT INTO public.public_jornadas(slug,title,activity_date,capacity) VALUES('qa-student','QA student','2026-11-28',20);
SET LOCAL ROLE authenticated;
DO $$ DECLARE s jsonb; BEGIN
 BEGIN PERFORM public.admin_public_jornada_report('qa'); RAISE EXCEPTION 'Student report allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Acceso no autorizado' THEN RAISE; END IF; END;
 PERFORM public.submit_public_jornada('qa-student',repeat('e',64),'Alumno','QA','5491199999901','voy');
 s:=public.submit_public_jornada('qa-student',repeat('f',64),'Other','QA','5491199999902','voy');
 IF (s->>'confirmed')::int<>1 OR s->'own'->>'first_name'<>'Alumno' THEN RAISE EXCEPTION 'Alumno duplicate or wrong identity'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.public_jornadas WHERE slug LIKE 'qa%') THEN RAISE EXCEPTION 'Rollback failed'; END IF; END $$;
SELECT 'Public jornada regression: OK' AS result;