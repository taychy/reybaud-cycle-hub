CREATE OR REPLACE FUNCTION public.guard_event_reservation_student_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_payment_status text[] := ARRAY['no_informado','no_aplica','pendiente','pago_informado','pago_rechazado'];
BEGIN
  -- Internal/admin paths are unrestricted: service role, definer functions and admins.
  IF current_user IN ('postgres','service_role','supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Never let the student change how much was actually paid or internal admin notes.
  IF COALESCE(NEW.amount_paid, 0) IS DISTINCT FROM COALESCE(OLD.amount_paid, 0) THEN
    RAISE EXCEPTION 'No podés modificar el monto pagado de tu reserva.';
  END IF;
  IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
    RAISE EXCEPTION 'No podés modificar las notas administrativas de tu reserva.';
  END IF;

  -- Payment status can only move to self-declared states, never to a paid state.
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NOT (NEW.payment_status = ANY (allowed_payment_status)) THEN
    RAISE EXCEPTION 'No podés marcar tu reserva con ese estado de pago.';
  END IF;

  -- Confirmation only allowed for free / inscription-only reservations.
  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     AND NEW.confirmed_at IS NOT NULL
     AND NOT (COALESCE(NEW.balance_due, 0) = 0
              AND COALESCE(NEW.amount_paid, 0) = 0
              AND COALESCE(NEW.payment_status, '') = 'no_aplica') THEN
    RAISE EXCEPTION 'No podés confirmar tu reserva sin el pago verificado.';
  END IF;

  -- Prices/balances become read-only for the student once any money was registered.
  IF COALESCE(OLD.amount_paid, 0) <> 0 THEN
    IF NEW.amount_total IS DISTINCT FROM OLD.amount_total
       OR NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot
       OR NEW.monto IS DISTINCT FROM OLD.monto
       OR NEW.balance_due IS DISTINCT FROM OLD.balance_due
       OR NEW.currency_snapshot IS DISTINCT FROM OLD.currency_snapshot
       OR NEW.moneda IS DISTINCT FROM OLD.moneda THEN
      RAISE EXCEPTION 'No podés modificar los importes de una reserva con pagos registrados.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_event_reservation_student_update ON public.event_reservations;
CREATE TRIGGER trg_guard_event_reservation_student_update
BEFORE UPDATE ON public.event_reservations
FOR EACH ROW EXECUTE FUNCTION public.guard_event_reservation_student_update();