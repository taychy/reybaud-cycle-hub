-- Regresión: acuerdo económico de transferencia de cupo. Todo termina en RAISE
-- EXCEPTION => no deja rastro. Leer "RESULT: ..." en el mensaje.
DO $$
DECLARE
  v_admin uuid; v_user uuid; r record; v_t uuid; v_new uuid; v_a1 uuid; out text := '';
  v_pay_orig_before int; v_g0 int; v_d0 int; v_o0 int; v_n int; v_ok boolean; v_tmp text; v_amt numeric;
BEGIN
  SELECT user_id INTO v_admin FROM user_roles WHERE role = 'admin' LIMIT 1;
  SELECT ur.user_id INTO v_user FROM user_roles ur WHERE ur.role = 'alumno'
    AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = ur.user_id AND x.role = 'admin') LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT er.* INTO r FROM event_reservations er
   WHERE er.reservation_status NOT IN ('cancelada','rechazada','expirada') AND er.package_id IS NOT NULL AND COALESCE(er.amount_paid,0) > 0
     AND NOT EXISTS (SELECT 1 FROM reservation_refund_obligations o WHERE o.reservation_id = er.id) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESULT: sin reserva pagada para probar'; END IF;
  v_amt := r.amount_paid;
  SELECT count(*) INTO v_pay_orig_before FROM reservation_payments WHERE reservation_id = r.id;
  v_t := (start_reservation_transfer(r.id) ->> 'transfer_id')::uuid;
  SELECT id INTO v_a1 FROM alumnos a WHERE NOT EXISTS (SELECT 1 FROM event_reservations x WHERE x.event_id = r.event_id AND x.alumno_id = a.id) LIMIT 1;
  INSERT INTO event_reservations (event_id, package_id, alumno_id, reservation_status, payment_status, amount_total, balance_due, currency_snapshot)
  VALUES (r.event_id, r.package_id, v_a1, 'pendiente_pago', 'pendiente', 1000, 1000, r.currency_snapshot) RETURNING id INTO v_new;
  PERFORM claim_reservation_transfer(v_new);

  out := out || format('1 primera seña permitida=%s; ', NOT reservation_transfer_payment_blocked(v_new));
  INSERT INTO reservation_payments (reservation_id, amount, currency, status, payment_method, payment_date)
  VALUES (v_new, 100, COALESCE(r.currency_snapshot,'ARS'), 'validado', 'mercado_pago', current_date);
  out := out || format('2 segundo pago bloqueado=%s; ', reservation_transfer_payment_blocked(v_new));
  out := out || format('3 estado pendiente acuerdo=%s; ', (SELECT status FROM reservation_transfers WHERE id = v_t) = 'payment_agreement_pending');
  INSERT INTO reservation_payments (reservation_id, amount, currency, status, payment_method, payment_date)
  VALUES (v_new, 50, COALESCE(r.currency_snapshot,'ARS'), 'validado', 'transferencia', current_date);
  SELECT count(*) INTO v_n FROM admin_notification_events WHERE deduplication_key = 'reservation_transfer_deposit_paid:' || v_t::text;
  out := out || format('4 alerta única=%s; ', v_n = 1);

  -- No admin no puede definir acuerdo
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  v_ok := false;
  BEGIN PERFORM define_reservation_transfer_payment_agreement(v_t, 'direct_to_original', v_amt, 0, 0, NULL, false);
  EXCEPTION WHEN others THEN v_ok := true; END;
  out := out || format('5 no admin rechazado=%s; ', v_ok);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_g0 FROM gastos; SELECT count(*) INTO v_d0 FROM devoluciones; SELECT count(*) INTO v_o0 FROM reservation_refund_obligations;

  -- Reybaud: crea obligación, no egreso; cierre bloqueado (subtransacción revertida)
  BEGIN
    PERFORM define_reservation_transfer_payment_agreement(v_t, 'reybaud', 0, 500, v_amt, NULL, false);
    v_tmp := format('6 reybaud obligación=%s sin egreso=%s; ',
      (SELECT monto_sugerido FROM reservation_refund_obligations WHERE reservation_id = r.id) = v_amt,
      (SELECT count(*) FROM gastos) = v_g0 AND (SELECT count(*) FROM devoluciones) = v_d0);
    v_ok := false;
    BEGIN PERFORM complete_reservation_transfer(v_t); EXCEPTION WHEN others THEN v_ok := true; END;
    v_tmp := v_tmp || format('7 cierre prematuro bloqueado=%s; ', v_ok);
    RAISE EXCEPTION 'rollback_sub';
  EXCEPTION WHEN others THEN IF SQLERRM <> 'rollback_sub' THEN v_tmp := '6/7 error: ' || SQLERRM || '; '; END IF;
  END;
  out := out || v_tmp;

  -- Mixed: separa montos sin duplicar
  BEGIN
    v_ok := false;
    BEGIN PERFORM define_reservation_transfer_payment_agreement(v_t, 'mixed', v_amt, 0, v_amt, NULL, false);
    EXCEPTION WHEN others THEN v_ok := true; END;
    PERFORM define_reservation_transfer_payment_agreement(v_t, 'mixed', round(v_amt/2,2), 100, v_amt - round(v_amt/2,2), NULL, false);
    v_tmp := format('8 mixed rechaza doble=%s separa=%s; ', v_ok,
      (SELECT direct_payment_amount + reybaud_refund_amount FROM reservation_transfers WHERE id = v_t) = v_amt
      AND (SELECT monto_sugerido FROM reservation_refund_obligations WHERE reservation_id = r.id) = v_amt - round(v_amt/2,2));
    RAISE EXCEPTION 'rollback_sub';
  EXCEPTION WHEN others THEN IF SQLERRM <> 'rollback_sub' THEN v_tmp := '8 error: ' || SQLERRM || '; '; END IF;
  END;
  out := out || v_tmp;

  -- Directo: caja 0, sin gasto/devolución/obligación; habilita pago; cierra
  PERFORM define_reservation_transfer_payment_agreement(v_t, 'direct_to_original', v_amt, 0, 0, 'test', true);
  out := out || format('9 directo sin gasto/devolución/obligación=%s; ',
    (SELECT count(*) FROM gastos) = v_g0 AND (SELECT count(*) FROM devoluciones) = v_d0 AND (SELECT count(*) FROM reservation_refund_obligations) = v_o0);
  out := out || format('10 pago habilitado tras acuerdo=%s; ', NOT reservation_transfer_payment_blocked(v_new));
  v_ok := false;
  BEGIN PERFORM define_reservation_transfer_payment_agreement(v_t, 'reybaud', 0, 0, 1, NULL, false); EXCEPTION WHEN others THEN v_ok := true; END;
  out := out || format('11 no redefine=%s; ', v_ok);
  PERFORM complete_reservation_transfer(v_t);
  out := out || format('12 completada=%s; ', (SELECT status FROM reservation_transfers WHERE id = v_t) = 'completed');
  out := out || format('13 pagos originales intactos=%s', (SELECT count(*) FROM reservation_payments WHERE reservation_id = r.id) = v_pay_orig_before);
  RAISE EXCEPTION 'RESULT: %', out;
END $$;
