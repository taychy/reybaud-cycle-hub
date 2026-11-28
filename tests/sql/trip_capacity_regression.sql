SELECT set_config('test.actor','00000000-0000-4000-8000-000000000001',false);
DO $$ DECLARE a jsonb; BEGIN
 a:=public.get_trip_request_capacity('408a8eb8-fb62-4a50-ad6d-040bd5716797','00000000-0000-4000-8000-000000000030');
 ASSERT (a->>'remaining')::int=9; ASSERT (a->>'total_capacity')::int=39;
 PERFORM public.admin_hold_trip_request_capacity(public.qa_request(1,'00000000-0000-4000-8000-000000000030',6),false,'hotel validado');
 PERFORM public.admin_hold_trip_request_capacity(public.qa_request(2,'00000000-0000-4000-8000-000000000040',3),false,'hotel validado');
 ASSERT (public.get_trip_request_capacity('408a8eb8-fb62-4a50-ad6d-040bd5716797','00000000-0000-4000-8000-000000000030')->>'remaining')::int=0;
 BEGIN PERFORM public.admin_hold_trip_request_capacity(public.qa_request(3,'00000000-0000-4000-8000-000000000030',1),false,'hotel validado'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'No hay plazas%'; END;
 BEGIN UPDATE public.event_enrollment_requests SET approved_unit_price=1 WHERE id=md5('1')::uuid; RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Liberá primero%'; END;
 BEGIN INSERT INTO public.event_reservations VALUES(gen_random_uuid(),'408a8eb8-fb62-4a50-ad6d-040bd5716797'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Reserva y cobro bloqueados%'; END;
 PERFORM public.admin_hold_trip_request_capacity(md5('1')::uuid,true,'liberación auditada');
 ASSERT (public.get_trip_request_capacity('408a8eb8-fb62-4a50-ad6d-040bd5716797','00000000-0000-4000-8000-000000000030')->>'remaining')::int=6;
 PERFORM public.admin_hold_trip_request_capacity(md5('1')::uuid,false,'hotel validado otra vez');
 ASSERT (SELECT count(*) FROM public.trip_capacity_holds WHERE request_id=md5('1')::uuid)=1;
 ASSERT (SELECT count(*) FROM public.event_reservations)=0;
END $$;
SELECT set_config('test.actor','',false);
DO $$ BEGIN
 BEGIN PERFORM public.admin_hold_trip_request_capacity(md5('1')::uuid,true,'falsificación'); RAISE EXCEPTION 'must fail'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Solo administración%'; END;
END $$;
SET ROLE anon;
SELECT public.get_trip_request_capacity('408a8eb8-fb62-4a50-ad6d-040bd5716797','00000000-0000-4000-8000-000000000030');
DO $$ BEGIN BEGIN PERFORM * FROM public.trip_capacity_holds; RAISE EXCEPTION 'must fail'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SELECT 'SQL shared cabin, total39, immutability, release, native block and anon access PASS';
