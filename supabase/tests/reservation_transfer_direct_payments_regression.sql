-- Regresión: acuerdo vs pago ejecutado en transferencias de cupo. Termina en RAISE EXCEPTION => sin rastro.
DO $$
DECLARE
  v_admin uuid; r record; v_t uuid; v_new uuid; v_a1 uuid; out text := ''; s jsonb; v_ok boolean; v_dp uuid;
  v_g0 int; v_d0 int; v_p0 int; v_mp0 int; v_amt numeric;
BEGIN
  SELECT user_id INTO v_admin FROM user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- Caso Ingrid/Fernando: acuerdo sin registros no cuenta como ejecutado
  s := reservation_effective_payment_summary('30c0259f-ebb5-45b8-a767-075aa95d7d16');
  out := out || format('0 fernando saldo=%s directo=%s estado=%s; ', s->>'effective_balance', s->>'direct_external_confirmed',
    (SELECT status FROM reservation_transfers WHERE id = 'e939fd47-66d5-4814-acaf-0065f69ec855'));

  SELECT er.* INTO r FROM event_reservations er
   WHERE er.reservation_status NOT IN ('cancelada','rechazada','expirada') AND er.package_id IS NOT NULL AND COALESCE(er.amount_paid,0) > 0
     AND NOT EXISTS (SELECT 1 FROM reservation_transfers x WHERE x.original_reservation_id = er.id OR x.replacement_reservation_id = er.id)
     AND NOT EXISTS (SELECT 1 FROM reservation_refund_obligations o WHERE o.reservation_id = er.id) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESULT: %sin reserva pagada', out; END IF;
  v_t := (start_reservation_transfer(r.id) ->> 'transfer_id')::uuid;
  SELECT id INTO v_a1 FROM alumnos a WHERE NOT EXISTS (SELECT 1 FROM event_reservations x WHERE x.event_id = r.event_id AND x.alumno_id = a.id) LIMIT 1;
  INSERT INTO event_reservations (event_id, package_id, alumno_id, reservation_status, payment_status, amount_total, balance_due, currency_snapshot)
  VALUES (r.event_id, r.package_id, v_a1, 'pendiente_pago', 'pendiente', 1000, 1000, r.currency_snapshot) RETURNING id INTO v_new;
  PERFORM claim_reservation_transfer(v_new);
  v_amt := LEAST(600, r.amount_paid);

  PERFORM define_reservation_transfer_payment_agreement(v_t, 'mixed', v_amt, 1000 - v_amt, 0.01, NULL, false);
  s := reservation_effective_payment_summary(v_new);
  out := out || format('1 acuerdo no cambia saldo=%s; ', (s->>'effective_balance')::numeric = 1000);
  v_ok := false; BEGIN PERFORM complete_reservation_transfer(v_t); EXCEPTION WHEN others THEN v_ok := true; END;
  out := out || format('2 cierre bloqueado tras acuerdo=%s; ', v_ok);

  SELECT count(*) INTO v_g0 FROM gastos; SELECT count(*) INTO v_d0 FROM devoluciones;
  SELECT count(*) INTO v_p0 FROM reservation_payments; SELECT count(*) INTO v_mp0 FROM mp_account_movements;
  v_dp := (register_reservation_transfer_direct_payment(v_t, 200, current_date, NULL, 'parcial') ->> 'id')::uuid;
  s := reservation_effective_payment_summary(v_new);
  out := out || format('3 parcial reduce 200=%s; ', (s->>'effective_balance')::numeric = 800);
  out := out || format('4 sin pago/gasto/devol/MP=%s; ', (SELECT count(*) FROM gastos) = v_g0 AND (SELECT count(*) FROM devoluciones) = v_d0
    AND (SELECT count(*) FROM reservation_payments) = v_p0 AND (SELECT count(*) FROM mp_account_movements) = v_mp0);
  v_ok := false; BEGIN PERFORM register_reservation_transfer_direct_payment(v_t, v_amt, current_date, NULL, NULL); EXCEPTION WHEN others THEN v_ok := true; END;
  out := out || format('5 no supera acordado=%s; ', v_ok);
  PERFORM void_reservation_transfer_direct_payment(v_dp, 'test');
  out := out || format('6 anular revierte=%s; ', (reservation_effective_payment_summary(v_new)->>'effective_balance')::numeric = 1000);

  PERFORM register_reservation_transfer_direct_payment(v_t, v_amt, current_date, NULL, NULL);
  INSERT INTO reservation_payments (reservation_id, amount, currency, status, payment_method, payment_date)
  VALUES (v_new, 1000 - v_amt - 1, COALESCE(r.currency_snapshot,'ARS'), 'validado', 'transferencia', current_date);
  s := reservation_effective_payment_summary(v_new);
  out := out || format('7 suma sin doble conteo=%s; ', (s->>'effective_balance')::numeric = 1);
  v_ok := false; BEGIN PERFORM complete_reservation_transfer(v_t); EXCEPTION WHEN others THEN v_ok := true; END;
  out := out || format('8 cierre bloqueado saldo>0=%s; ', v_ok);
  INSERT INTO reservation_payments (reservation_id, amount, currency, status, payment_method, payment_date)
  VALUES (v_new, 1, COALESCE(r.currency_snapshot,'ARS'), 'validado', 'transferencia', current_date);
  UPDATE reservation_refund_obligations SET estado = 'completada' WHERE reservation_id = r.id;
  PERFORM complete_reservation_transfer(v_t);
  out := out || format('9 cierre permitido=%s', (SELECT status FROM reservation_transfers WHERE id = v_t) = 'completed');
  RAISE EXCEPTION 'RESULT: %', out;
END $$;
