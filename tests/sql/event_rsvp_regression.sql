-- Controles aislados; no ejecutan correos ni crean reservas/pagos.
CREATE OR REPLACE FUNCTION public.test_assert(condition boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT condition THEN RAISE EXCEPTION 'FAIL: %', message; END IF;
  RAISE NOTICE 'PASS: %', message;
END $$;

DO $$
DECLARE
  v_invite uuid;
  v_token uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_count integer;
  v_status jsonb;
BEGIN
  INSERT INTO public.event_rsvp_invites (event_id, alumno_id, recipient_email, token)
  VALUES ('08fc7e07-10df-4ace-b3ed-a0d581b6f7c9', '11111111-1111-1111-1111-111111111111', 'prueba@example.com', v_token)
  RETURNING id INTO v_invite;
  PERFORM public.test_assert((SELECT count(*) FROM public.event_rsvp_invites) = 1, 'alta individual');

  BEGIN
    INSERT INTO public.event_rsvp_invites (event_id, recipient_email) VALUES ('08fc7e07-10df-4ace-b3ed-a0d581b6f7c9', 'prueba@example.com');
    RAISE EXCEPTION 'FAIL: duplicado aceptado';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: unicidad evento/email/tipo'; END;

  PERFORM public.respond_event_rsvp(v_token, 'voy', 'fondo_y_almuerzo', 3);
  PERFORM public.test_assert((SELECT lunch_status = 'intencion_confirmada' FROM public.event_rsvp_invites WHERE id=v_invite), 'VOY sólo confirma intención');
  v_status := public.get_event_rsvp_by_token(v_token);
  PERFORM public.test_assert(v_status->>'recipient_email' IS NULL AND v_status->>'token' IS NULL, 'lectura pública no expone email ni token');
  PERFORM public.test_assert(v_status->'prices'->>'prices_confirmed_at' IS NULL, 'tarifas inician bloqueadas');

  BEGIN
    PERFORM public.confirm_event_rsvp_lunch(v_token, 2, 1, 1);
    RAISE EXCEPTION 'FAIL: aceptación sin tarifas';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'PASS: almuerzo bloqueado sin tarifas'; END;

  BEGIN
    PERFORM public.admin_set_event_rsvp_prices('08fc7e07-10df-4ace-b3ed-a0d581b6f7c9', 45000, 25000, 0, 'sin admin');
    RAISE EXCEPTION 'FAIL: precio sin admin';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'PASS: tarifas rechazadas sin sesión admin'; END;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  PERFORM public.admin_set_event_rsvp_prices('08fc7e07-10df-4ace-b3ed-a0d581b6f7c9', 45000, 25000, 0, 'Confirmado con restaurante');
  PERFORM public.test_assert((SELECT under_4_price = 0 FROM public.event_rsvp_settings), 'menor de cuatro admite cero confirmado explícitamente');
  PERFORM public.test_assert((SELECT count(*) FROM public.audit_log WHERE action='event_rsvp_prices_confirmed') = 1, 'confirmación de tarifas auditada');

  BEGIN
    PERFORM public.confirm_event_rsvp_lunch(v_token, 2, 1, 0);
    RAISE EXCEPTION 'FAIL: cantidades incoherentes';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'PASS: comensales deben coincidir con acompañantes'; END;

  PERFORM public.confirm_event_rsvp_lunch(v_token, 2, 1, 1);
  PERFORM public.test_assert((SELECT terms_version='fondazo-almuerzo-v1-2026-11-16' AND terms_accepted_at IS NOT NULL FROM public.event_rsvp_invites WHERE id=v_invite), 'aceptación versionada con fecha');
  PERFORM public.test_assert((SELECT terms_text_snapshot LIKE '%25 y el 28/11/2026%' FROM public.event_rsvp_invites WHERE id=v_invite), 'texto aceptado conserva intervalo pendiente');
  PERFORM public.test_assert((SELECT lunch_status='instrucciones_pendientes' FROM public.event_rsvp_invites WHERE id=v_invite), 'aceptar no verifica pago');

  BEGIN
    PERFORM public.admin_set_event_rsvp_lunch_status(v_invite, 'pago_verificado', '');
    RAISE EXCEPTION 'FAIL: estado sin comentario';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'PASS: cambio exige comentario'; END;

  PERFORM public.admin_set_event_rsvp_lunch_status(v_invite, 'instrucciones_enviadas', 'Correo Brevo aceptado', null);
  PERFORM public.admin_set_event_rsvp_lunch_status(v_invite, 'comprobante_informado', 'Comprobante recibido manualmente', 'nota-interna-1');
  PERFORM public.admin_set_event_rsvp_lunch_status(v_invite, 'pago_verificado', 'Verificado con restaurante', 'nota-interna-1');
  PERFORM public.test_assert((SELECT lunch_status='pago_verificado' FROM public.event_rsvp_invites WHERE id=v_invite), 'sólo admin verifica reserva');

  BEGIN
    PERFORM public.respond_event_rsvp(v_token, 'no_voy', null, 0);
    RAISE EXCEPTION 'FAIL: retirar interés con pago';
  EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'PASS: pago verificado exige revisión antes de cambiar asistencia'; END;

  PERFORM public.admin_set_event_rsvp_lunch_status(v_invite, 'comprobante_informado', 'Reversión por diferencia informada', 'nota-interna-1');
  SELECT count(*) INTO v_count FROM public.event_rsvp_lunch_audit WHERE invite_id=v_invite;
  PERFORM public.test_assert(v_count=5, 'aceptación, transiciones y reversión conservan historial');
  PERFORM public.test_assert((SELECT count(*) FROM public.audit_log WHERE details ? 'token') = 0, 'auditoría no guarda tokens');

  RESET request.jwt.claim.sub;
  SET ROLE anon;
  BEGIN
    PERFORM count(*) FROM public.event_rsvp_invites;
    RAISE EXCEPTION 'FAIL: lectura anónima directa';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: tabla privada para anon'; END;
  RESET ROLE;
END $$;
