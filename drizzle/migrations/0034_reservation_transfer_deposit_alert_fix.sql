CREATE OR REPLACE FUNCTION public.trg_transfer_deposit_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; r record; v_name text; v_email text; v_tel text;
BEGIN
  IF NEW.status <> 'validado' OR NEW.anulado_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'validado' THEN RETURN NEW; END IF;
  SELECT * INTO t FROM reservation_transfers
   WHERE replacement_reservation_id = NEW.reservation_id AND status IN ('reserved','deposit_paid') AND agreement_defined_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  UPDATE reservation_transfers SET status = 'payment_agreement_pending', deposit_paid_at = now(),
         deposit_amount = COALESCE(NEW.equivalent_amount_event_currency, NEW.amount, 0), updated_at = now()
   WHERE id = t.id;
  -- La alerta nunca debe impedir registrar el pago real.
  BEGIN
    SELECT * INTO r FROM event_reservations WHERE id = NEW.reservation_id;
    SELECT COALESCE(NULLIF(trim(concat_ws(' ', a.nombre, a.apellido)),''), trim(concat_ws(' ', e.nombre, e.apellido))),
           COALESCE(a.email, e.email, r.external_email), COALESCE(a.telefono, e.telefono)
      INTO v_name, v_email, v_tel
      FROM (SELECT 1) x
      LEFT JOIN alumnos a ON a.id = r.alumno_id
      LEFT JOIN event_external_participants e ON e.id = r.external_participant_id;
    INSERT INTO admin_notification_events (tipo, prioridad, reservation_id, payload, deduplication_key)
    VALUES ('reservation_transfer_deposit_paid', 'pago', NEW.reservation_id,
      jsonb_build_object('titulo', 'URGENTE — Contactar comprador de cupo transferido', 'urgente', true,
        'transfer_id', t.id, 'event_id', t.event_id, 'package_id', t.package_id,
        'original_reservation_id', t.original_reservation_id, 'replacement_reservation_id', NEW.reservation_id,
        'importe_sena', COALESCE(NEW.equivalent_amount_event_currency, NEW.amount, 0), 'moneda', COALESCE(r.currency_snapshot, r.moneda),
        'comprador', v_name, 'email', v_email, 'telefono', v_tel),
      'reservation_transfer_deposit_paid:' || t.id::text)
    ON CONFLICT (deduplication_key) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'reservation_transfer alert failed: %', SQLERRM;
  END;
  INSERT INTO audit_log (user_role, action, entity_type, entity_id, details)
  VALUES ('system', 'reserva.transferencia.sena_recibida', 'reservation_transfer', t.id::text,
    jsonb_build_object('payment_id', NEW.id, 'replacement_reservation_id', NEW.reservation_id, 'importe', COALESCE(NEW.equivalent_amount_event_currency, NEW.amount, 0)));
  RETURN NEW;
END $$;