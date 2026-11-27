CREATE OR REPLACE FUNCTION public._rsvp_guard_active_lunch_receipts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.event_rsvp_lunch_payments p WHERE p.invite_id = OLD.id AND p.voided_at IS NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.response IS DISTINCT FROM OLD.response
     OR NEW.participation_mode IS DISTINCT FROM OLD.participation_mode
     OR NEW.non_cyclist_guests IS DISTINCT FROM OLD.non_cyclist_guests
     OR NEW.cyclist_guests IS DISTINCT FROM OLD.cyclist_guests
     OR NEW.lunch_attendees IS DISTINCT FROM OLD.lunch_attendees
     OR NEW.guests_count IS DISTINCT FROM OLD.guests_count
     OR NEW.adults_count IS DISTINCT FROM OLD.adults_count
     OR NEW.children_4_9_count IS DISTINCT FROM OLD.children_4_9_count
     OR NEW.under_4_count IS DISTINCT FROM OLD.under_4_count
     OR NEW.participant_first_name IS DISTINCT FROM OLD.participant_first_name
     OR NEW.participant_last_name IS DISTINCT FROM OLD.participant_last_name
     OR NEW.recipient_name IS DISTINCT FROM OLD.recipient_name THEN
    RAISE EXCEPTION 'Hay un comprobante de almuerzo registrado: para cambiar comensales o asistencia, administración debe anularlo primero.';
  END IF;
  IF NEW.lunch_status IS DISTINCT FROM OLD.lunch_status AND NEW.lunch_status NOT IN ('comprobante_informado','pago_verificado') THEN
    RAISE EXCEPTION 'Hay comprobantes registrados vigentes: el estado debe quedar en «Comprobante recibido». Anulalos antes de volver a un estado anterior.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._rsvp_guard_active_lunch_receipts() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER event_rsvp_invites_guard_active_lunch_receipts
  BEFORE UPDATE ON public.event_rsvp_invites
  FOR EACH ROW EXECUTE FUNCTION public._rsvp_guard_active_lunch_receipts();