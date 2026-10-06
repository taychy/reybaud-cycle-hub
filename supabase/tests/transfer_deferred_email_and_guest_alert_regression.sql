-- Regresión: aviso de invitado con prioridad válida + mail de saldo diferido/reencolado.
-- Todo termina en RAISE EXCEPTION => sin rastro. Leer "RESULT: ...".
DO $$
DECLARE
  v_admin uuid; r record; v_t uuid; v_new uuid; v_new2 uuid; v_a1 uuid; v_ev uuid; v_ok boolean; out text := '';
BEGIN
  SELECT user_id INTO v_admin FROM user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- A) aviso de invitado por transferencia: 'pago' se guarda; 'alta' es rechazada (y se captura sin romper)
  SELECT id INTO v_ev FROM event_reservations LIMIT 1;
  INSERT INTO admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
  VALUES ('guest_reservation_transferencia_pendiente','pago', v_ev, '{}'::jsonb, 'test-guest-transf-'||v_ev);
  out := out || format('A1 aviso pago guardado=%s; ', EXISTS(SELECT 1 FROM admin_notification_events WHERE deduplication_key='test-guest-transf-'||v_ev));
  v_ok := false;
  BEGIN INSERT INTO admin_notification_events (tipo, prioridad, payload, deduplication_key) VALUES ('x','alta','{}','test-alta');
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  out := out || format('A2 alta rechazada sin abortar=%s; ', v_ok);

  -- B) transferencia: aviso diferido se reencola al definir acuerdo si hay saldo
  SELECT er.* INTO r FROM event_reservations er
   WHERE er.reservation_status NOT IN ('cancelada','rechazada','expirada') AND er.package_id IS NOT NULL AND COALESCE(er.amount_paid,0) > 0
     AND NOT EXISTS (SELECT 1 FROM reservation_refund_obligations o WHERE o.reservation_id = er.id) LIMIT 1;
  v_t := (start_reservation_transfer(r.id) ->> 'transfer_id')::uuid;
  SELECT id INTO v_a1 FROM alumnos a WHERE NOT EXISTS (SELECT 1 FROM event_reservations x WHERE x.event_id = r.event_id AND x.alumno_id = a.id) LIMIT 1;
  INSERT INTO event_reservations (event_id, package_id, alumno_id, reservation_status, payment_status, amount_total, balance_due, currency_snapshot)
  VALUES (r.event_id, r.package_id, v_a1, 'pendiente_pago', 'pendiente', 1000, 1000, r.currency_snapshot) RETURNING id INTO v_new;
  PERFORM claim_reservation_transfer(v_new);
  INSERT INTO reservation_payments (reservation_id, amount, currency, status, payment_method, payment_date)
  VALUES (v_new, 100, COALESCE(r.currency_snapshot,'ARS'), 'validado', 'mercado_pago', current_date);
  INSERT INTO admin_notification_events (tipo, prioridad, reservation_id, status, deduplication_key)
  VALUES ('reserva_confirmada','pago', v_new, 'diferido', 'transfer-saldo-deferred-'||v_new);
  out := out || format('B1 diferido no enviado=%s; ', (SELECT status FROM admin_notification_events WHERE deduplication_key='transfer-saldo-deferred-'||v_new)='diferido');
  UPDATE event_reservations SET balance_due = 900 WHERE id = v_new;
  PERFORM define_reservation_transfer_payment_agreement(v_t, 'direct_to_original', r.amount_paid, 0, 0, NULL, true);
  out := out || format('B2 reencolado=%s; ', (SELECT status FROM admin_notification_events WHERE deduplication_key='transfer-saldo-deferred-'||v_new)='pendiente');
  out := out || format('B3 un solo aviso=%s; ', (SELECT count(*) FROM admin_notification_events WHERE reservation_id=v_new AND tipo='reserva_confirmada')=1);
  out := out || format('B4 desbloqueado=%s; ', NOT reservation_transfer_payment_blocked(v_new));

  RAISE EXCEPTION 'RESULT: %', out;
END $$;

-- C) sin saldo => silenciado (bloque aparte)
DO $$
DECLARE v_admin uuid; r record; v_t uuid; v_new uuid; v_a1 uuid;
BEGIN
  SELECT user_id INTO v_admin FROM user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SELECT er.* INTO r FROM event_reservations er
   WHERE er.reservation_status NOT IN ('cancelada','rechazada','expirada') AND er.package_id IS NOT NULL AND COALESCE(er.amount_paid,0) > 0
     AND NOT EXISTS (SELECT 1 FROM reservation_refund_obligations o WHERE o.reservation_id = er.id) LIMIT 1;
  v_t := (start_reservation_transfer(r.id) ->> 'transfer_id')::uuid;
  SELECT id INTO v_a1 FROM alumnos a WHERE NOT EXISTS (SELECT 1 FROM event_reservations x WHERE x.event_id = r.event_id AND x.alumno_id = a.id) LIMIT 1;
  INSERT INTO event_reservations (event_id, package_id, alumno_id, reservation_status, payment_status, amount_total, balance_due, currency_snapshot)
  VALUES (r.event_id, r.package_id, v_a1, 'pendiente_pago', 'pendiente', 100, 100, r.currency_snapshot) RETURNING id INTO v_new;
  PERFORM claim_reservation_transfer(v_new);
  INSERT INTO reservation_payments (reservation_id, amount, currency, status, payment_method, payment_date)
  VALUES (v_new, 100, COALESCE(r.currency_snapshot,'ARS'), 'validado', 'mercado_pago', current_date);
  INSERT INTO admin_notification_events (tipo, prioridad, reservation_id, status, deduplication_key)
  VALUES ('reserva_confirmada','pago', v_new, 'diferido', 'transfer-saldo-deferred-'||v_new);
  UPDATE event_reservations SET balance_due = 0 WHERE id = v_new;
  PERFORM define_reservation_transfer_payment_agreement(v_t, 'direct_to_original', r.amount_paid, 0, 0, NULL, true);
  RAISE EXCEPTION 'RESULT: C sin saldo silenciado=%', (SELECT status FROM admin_notification_events WHERE deduplication_key='transfer-saldo-deferred-'||v_new)='silenciado';
END $$;
