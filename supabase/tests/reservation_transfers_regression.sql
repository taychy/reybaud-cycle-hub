-- Regresión: cupo en reventa (reservation_transfers). Corre todo dentro de un
-- bloque que termina en RAISE EXCEPTION, por lo que NO deja rastro.
-- Lee el resultado en el mensaje de la excepción ("RESULT: ...").
DO $$
DECLARE
  v_admin uuid; r record; v_t uuid; v_new1 uuid; v_new2 uuid; v_c1 uuid; v_c2 uuid;
  v_pay_before int; v_pay_after int; v_rooms_after int; v_dup_ok boolean := false; v_a1 uuid; v_a2 uuid; out text := '';
BEGIN
  SELECT user_id INTO v_admin FROM user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT er.* INTO r FROM event_reservations er
   JOIN event_room_assignments a ON a.reservation_id = er.id
   WHERE er.reservation_status NOT IN ('cancelada','rechazada','expirada') AND er.package_id IS NOT NULL LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESULT: sin reserva con habitación para probar'; END IF;
  SELECT count(*) INTO v_pay_before FROM reservation_payments WHERE reservation_id = r.id;

  v_t := (start_reservation_transfer(r.id) ->> 'transfer_id')::uuid;
  SELECT count(*) INTO v_rooms_after FROM event_room_assignments WHERE reservation_id = r.id;
  out := out || format('1 habitación liberada=%s; ', v_rooms_after = 0);

  BEGIN PERFORM start_reservation_transfer(r.id); EXCEPTION WHEN others THEN v_dup_ok := true; END;
  out := out || format('2 sin doble transferencia=%s; ', v_dup_ok);

  SELECT id INTO v_a1 FROM alumnos a WHERE NOT EXISTS (SELECT 1 FROM event_reservations x WHERE x.event_id = r.event_id AND x.alumno_id = a.id) LIMIT 1;
  SELECT id INTO v_a2 FROM alumnos a WHERE a.id <> v_a1 AND NOT EXISTS (SELECT 1 FROM event_reservations x WHERE x.event_id = r.event_id AND x.alumno_id = a.id) LIMIT 1;
  INSERT INTO event_reservations (event_id, package_id, alumno_id, external_participant_id, reservation_status, payment_status, amount_total, balance_due)
  VALUES (r.event_id, r.package_id, v_a1, NULL, 'pendiente_pago', 'pendiente', 1, 1) RETURNING id INTO v_new1;
  INSERT INTO event_reservations (event_id, package_id, alumno_id, external_participant_id, reservation_status, payment_status, amount_total, balance_due)
  VALUES (r.event_id, r.package_id, v_a2, NULL, 'pendiente_pago', 'pendiente', 1, 1) RETURNING id INTO v_new2;
  v_c1 := claim_reservation_transfer(v_new1);
  v_c2 := claim_reservation_transfer(v_new2);
  out := out || format('3 FIFO claim=%s; 4 sin doble claim=%s; ', v_c1 = v_t, v_c2 IS NULL);
  out := out || format('5 vínculo=%s; ', EXISTS (SELECT 1 FROM reservation_transfers WHERE id = v_t AND original_reservation_id = r.id AND replacement_reservation_id = v_new1 AND status = 'reserved'));
  out := out || format('6 reclamo idempotente=%s; ', claim_reservation_transfer(v_new1) = v_t);
  out := out || format('7 original no se autoreclama=%s; ', claim_reservation_transfer(r.id) IS NULL);
  SELECT count(*) INTO v_pay_after FROM reservation_payments WHERE reservation_id = r.id;
  out := out || format('8 pagos originales intactos=%s', v_pay_before = v_pay_after);
  RAISE EXCEPTION 'RESULT: %', out;
END $$;
