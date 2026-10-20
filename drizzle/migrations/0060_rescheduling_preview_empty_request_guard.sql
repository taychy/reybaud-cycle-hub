DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.admin_rescheduling_settlement_preview(uuid)'::regprocedure) INTO d;
d:=replace(d,'(s->''request'') - ARRAY[''snapshot'',''actor_id'',''command_id'',''reviewed_by'']::text[]','CASE WHEN jsonb_typeof(s->''request'')=''object'' THEN (s->''request'') - ARRAY[''snapshot'',''actor_id'',''command_id'',''reviewed_by'']::text[] ELSE NULL END');
EXECUTE d;
END $$;