-- Read-only transaction: no fixtures, answers, users or campaign changes persist.
BEGIN;
SET TRANSACTION READ ONLY;
DO $$
DECLARE
 ev uuid := '67b4e85d-b00b-4b74-9644-99458d948c65';
 admin_id uuid := '0d70cac6-b7ff-4041-a90e-d40614f39622';
 ctx jsonb; own_id uuid; foreign_id uuid; raw_token text;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 ctx := public.get_rescheduling_context(ev);
 IF coalesce((ctx->>'admin')::boolean,false) OR jsonb_array_length(coalesce(ctx->'reservations','[]')) >= 32 THEN RAISE EXCEPTION 'Implicit admin access'; END IF;
 SELECT er.id INTO foreign_id FROM event_reservations er
 WHERE er.event_id=ev AND er.reservation_status NOT IN ('cancelada','rechazada','cancelled','cancelado')
 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(ctx->'reservations','[]')) r WHERE r->>'reservation_id'=er.id::text) LIMIT 1;
 IF foreign_id IS NULL THEN RAISE EXCEPTION 'Missing unrelated reservation for denial check'; END IF;
 SELECT access_token INTO raw_token FROM event_reservations WHERE id=foreign_id;
 IF jsonb_array_length(coalesce(public.get_rescheduling_context(ev,foreign_id)->'reservations','[]'))<>0 THEN RAISE EXCEPTION 'Admin opened foreign reservation'; END IF;
 IF jsonb_array_length(coalesce(public.get_rescheduling_context(ev,foreign_id,raw_token)->'reservations','[]'))<>0 THEN RAISE EXCEPTION 'Raw link bypassed identity'; END IF;
 BEGIN
  PERFORM public.submit_rescheduling_request(ev,foreign_id,'{"choice":"help","consent":true}'::jsonb,0,gen_random_uuid(),raw_token);
  RAISE EXCEPTION 'Foreign submission accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Acceso no autorizado' THEN RAISE; END IF;
 END;
 SELECT (r->>'reservation_id')::uuid INTO own_id FROM jsonb_array_elements(coalesce(ctx->'reservations','[]')) r LIMIT 1;
 IF own_id IS NOT NULL AND jsonb_array_length(coalesce(public.get_rescheduling_context(ev,own_id)->'reservations','[]'))<>1 THEN RAISE EXCEPTION 'Own reservation unavailable'; END IF;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF jsonb_array_length(coalesce(public.get_rescheduling_context(ev)->'reservations','[]'))<>0 THEN RAISE EXCEPTION 'Anonymous listing'; END IF;
 IF jsonb_array_length(coalesce(public.get_rescheduling_context(ev,foreign_id,raw_token)->'reservations','[]'))<>0 THEN RAISE EXCEPTION 'Anonymous raw link opened'; END IF;
 IF jsonb_array_length(coalesce(public.get_rescheduling_context(ev,foreign_id,'invalid')->'reservations','[]'))<>0 THEN RAISE EXCEPTION 'Invalid credential opened'; END IF;
 RAISE NOTICE 'Account isolation read-only QA OK';
END $$;
ROLLBACK;