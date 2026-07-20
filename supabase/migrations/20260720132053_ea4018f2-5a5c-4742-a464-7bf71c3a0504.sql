
-- 1) Trigger to block new reservations when event is sold out / cancelled / finalised.
-- Allows admin-initiated inserts (created_by = 'admin') as an escape hatch.

CREATE OR REPLACE FUNCTION public.enforce_event_open_for_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado TEXT;
  v_title  TEXT;
BEGIN
  SELECT estado_publicacion, title
    INTO v_estado, v_title
  FROM public.events
  WHERE id = NEW.event_id;

  IF v_estado IN ('agotado', 'cancelado', 'finalizado') AND COALESCE(NEW.created_by, 'cliente') <> 'admin' THEN
    RAISE EXCEPTION 'EVENT_NOT_OPEN_FOR_RESERVATION: el evento "%" no acepta nuevas inscripciones (estado: %). Usá el flujo de lista de espera.', v_title, v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_open_for_reservation ON public.event_reservations;
CREATE TRIGGER trg_enforce_event_open_for_reservation
BEFORE INSERT ON public.event_reservations
FOR EACH ROW EXECUTE FUNCTION public.enforce_event_open_for_reservation();

-- 2) Audit changes to events.estado_publicacion into audit_log for future traceability.
CREATE OR REPLACE FUNCTION public.audit_event_publication_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_publicacion IS DISTINCT FROM OLD.estado_publicacion THEN
    BEGIN
      INSERT INTO public.audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
      VALUES (
        COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE((auth.jwt() ->> 'email'), 'system'),
        'admin',
        'event_publication_status_changed',
        'event',
        NEW.id,
        jsonb_build_object('from', OLD.estado_publicacion, 'to', NEW.estado_publicacion, 'event_title', NEW.title)
      );
    EXCEPTION WHEN OTHERS THEN
      -- no bloquear el update por fallas de auditoría
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_event_publication_status ON public.events;
CREATE TRIGGER trg_audit_event_publication_status
AFTER UPDATE OF estado_publicacion ON public.events
FOR EACH ROW EXECUTE FUNCTION public.audit_event_publication_status();
