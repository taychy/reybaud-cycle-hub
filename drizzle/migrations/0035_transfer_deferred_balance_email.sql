ALTER TABLE public.admin_notification_events DROP CONSTRAINT IF EXISTS admin_notification_events_status_check;
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.admin_notification_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%status%enviado%' LOOP
    EXECUTE format('ALTER TABLE public.admin_notification_events DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.admin_notification_events ADD CONSTRAINT admin_notification_events_status_check
  CHECK (status = ANY (ARRAY['pendiente','enviado','fallido','silenciado','diferido']));

CREATE OR REPLACE FUNCTION public.requeue_deferred_transfer_balance_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric;
BEGIN
  IF NEW.replacement_reservation_id IS NULL OR NEW.agreement_defined_at IS NULL OR OLD.agreement_defined_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(balance_due,0) INTO v_balance FROM event_reservations WHERE id = NEW.replacement_reservation_id;
  IF COALESCE(v_balance,0) > 0 THEN
    UPDATE admin_notification_events
       SET status='pendiente', last_error=NULL, intentos=0,
           payload = COALESCE(payload,'{}'::jsonb) || jsonb_build_object('requeued_by_transfer', NEW.id, 'requeued_at', now()),
           updated_at = now()
     WHERE reservation_id = NEW.replacement_reservation_id AND tipo='reserva_confirmada' AND status='diferido';
  ELSE
    UPDATE admin_notification_events
       SET status='silenciado', last_error='no_balance_after_transfer_agreement', updated_at=now()
     WHERE reservation_id = NEW.replacement_reservation_id AND tipo='reserva_confirmada' AND status='diferido';
  END IF;
  INSERT INTO audit_log(action, entity_type, entity_id, user_role, details)
  VALUES ('reservation_transfer.balance_email_requeue','reservation_transfer',NEW.id,'system',
          jsonb_build_object('replacement_reservation_id',NEW.replacement_reservation_id,'balance_due',v_balance));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.requeue_deferred_transfer_balance_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transfer_requeue_balance_email ON public.reservation_transfers;
CREATE TRIGGER trg_transfer_requeue_balance_email
AFTER UPDATE OF agreement_defined_at ON public.reservation_transfers
FOR EACH ROW EXECUTE FUNCTION public.requeue_deferred_transfer_balance_email();