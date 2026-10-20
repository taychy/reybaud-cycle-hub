DO $$ DECLARE d text;BEGIN
SELECT pg_get_functiondef('public._rescheduling_settlement_totals(jsonb)'::regprocedure) INTO d;
d:=replace(d,'duplicate boolean;','duplicate boolean; seen_mp text[]:=''{}''; seen_refs text[]:=''{}'';');
d:=replace(d,'paid:=paid+coalesce((x->>''amount'')::numeric,0);','IF (nullif(x->>''mp_payment_id'','''') IS NOT NULL AND (x->>''mp_payment_id'')=ANY(seen_mp)) OR (nullif(x->>''payment_reference'','''') IS NOT NULL AND (x->>''payment_reference'')=ANY(seen_refs)) THEN excluded:=excluded+1; CONTINUE; END IF;
IF nullif(x->>''mp_payment_id'','''') IS NOT NULL THEN seen_mp:=array_append(seen_mp,x->>''mp_payment_id''); END IF;
IF nullif(x->>''payment_reference'','''') IS NOT NULL THEN seen_refs:=array_append(seen_refs,x->>''payment_reference''); END IF;
paid:=paid+coalesce((x->>''amount'')::numeric,0);');
EXECUTE d;
END $$;