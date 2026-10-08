-- Regresión: condiciones pendientes en reservas de Administración (se revierte siempre con RAISE final).
DO $$
DECLARE
  rep text := '';
  adm uuid := (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1);
  ev uuid := 'e726408b-bf46-45d6-9678-dc426a2d8641';
  pk uuid := (SELECT id FROM public.event_packages WHERE event_id = 'e726408b-bf46-45d6-9678-dc426a2d8641' AND nombre ILIKE '%doble%' LIMIT 1);
  rid uuid; tok text; j jsonb; r record; ok boolean; hist int;
BEGIN
  hist := (SELECT count(*) FROM public.event_reservations WHERE terminos_pendientes);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  PERFORM public.admin_create_event_reservation(ev, pk, NULL, '{"nombre":"Prueba","apellido":"QA","email":"qa-terminos@example.invalid"}'::jsonb, 'qa');
  SELECT * INTO r FROM public.event_reservations WHERE external_email = 'qa-terminos@example.invalid';
  rid := r.id; tok := r.terminos_token;
  rep := rep || format('1 alta admin: pendiente=%s accepted=%s token_len=%s vence_30d=%s | ', r.terminos_pendientes, r.accepted_terms, length(tok), r.terminos_token_expires_at > now() + interval '29 days');

  ok := false;
  BEGIN
    INSERT INTO public.reservation_payments(reservation_id, amount, currency, status, payment_method) VALUES (rid, 500, 'EUR', 'validado', 'efectivo');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'Condiciones pendientes%'; END;
  rep := rep || format('2 seña bloqueada antes=%s | ', ok);

  rep := rep || format('3 token corto=%s inexistente=%s | ', public.get_reservation_terms_by_token('x')->>'status', public.get_reservation_terms_by_token(repeat('a',48))->>'status');
  ok := false;
  BEGIN PERFORM public.accept_reservation_terms_by_token(repeat('a',48), 'bormio-2027-v1'); EXCEPTION WHEN others THEN ok := true; END;
  rep := rep || format('3b aceptar token inválido rechazado=%s | ', ok);

  PERFORM set_config('app.terms_internal', 'on', true);
  UPDATE public.event_reservations SET terminos_token_expires_at = now() - interval '1 day' WHERE id = rid;
  PERFORM set_config('app.terms_internal', 'off', true);
  ok := false;
  BEGIN PERFORM public.accept_reservation_terms_by_token(tok, 'bormio-2027-v1'); EXCEPTION WHEN others THEN ok := true; END;
  rep := rep || format('4 expirado lectura=%s aceptar rechazado=%s | ', public.get_reservation_terms_by_token(tok)->>'status', ok);
  PERFORM set_config('app.terms_internal', 'on', true);
  UPDATE public.event_reservations SET terminos_token_expires_at = now() + interval '30 days' WHERE id = rid;
  PERFORM set_config('app.terms_internal', 'off', true);

  ok := false;
  BEGIN PERFORM public.accept_reservation_terms_by_token(tok, '1'); EXCEPTION WHEN others THEN ok := true; END;
  rep := rep || format('5 versión vieja rechazada=%s | ', ok);

  -- Un alumno cualquiera no puede limpiar el pendiente por update directo.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  ok := false;
  BEGIN UPDATE public.event_reservations SET terminos_pendientes = false WHERE id = rid; EXCEPTION WHEN others THEN ok := true; END;
  rep := rep || format('6 update directo bloqueado=%s | ', ok);

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  j := public.get_reservation_terms_by_token(tok);
  rep := rep || format('7 lectura pública status=%s version=%s expone_email=%s expone_montos=%s | ', j->>'status', j->'terms'->>'version', j::text ILIKE '%example.invalid%', j ? 'amount_total');
  j := public.accept_reservation_terms_by_token(tok, 'bormio-2027-v1');
  SELECT * INTO r FROM public.event_reservations WHERE id = rid;
  rep := rep || format('8 aceptada: pendiente=%s accepted=%s at=%s version=%s token_borrado=%s canal=%s snapshot_sena_ok=%s historial=%s | ',
    r.terminos_pendientes, r.accepted_terms, r.terminos_aceptados_at IS NOT NULL, r.terminos_version_aceptada, r.terminos_token IS NULL,
    r.terminos_snapshot->>'canal', r.terminos_snapshot->>'politica_sena' = (SELECT metadata->>'politica_sena' FROM public.events WHERE id = ev),
    (SELECT count(*) FROM public.reservation_status_history WHERE reservation_id = rid AND note LIKE 'Condiciones aceptadas%'));
  ok := false;
  BEGIN PERFORM public.accept_reservation_terms_by_token(tok, 'bormio-2027-v1'); EXCEPTION WHEN others THEN ok := true; END;
  rep := rep || format('9 token reusado rechazado=%s | ', ok);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  ok := true;
  BEGIN
    INSERT INTO public.reservation_payments(reservation_id, amount, currency, status, payment_method) VALUES (rid, 500, 'EUR', 'validado', 'efectivo');
  EXCEPTION WHEN others THEN ok := false; rep := rep || SQLERRM; END;
  rep := rep || format('10 seña permitida después=%s | ', ok);
  rep := rep || format('11 históricos pendientes antes=%s después=%s', hist, (SELECT count(*) FROM public.event_reservations WHERE terminos_pendientes AND id <> rid));
  RAISE EXCEPTION 'RESULTADO (revertido): %', rep;
END $$;
