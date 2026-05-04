
-- Function to check for duplicate active subscriptions
CREATE OR REPLACE FUNCTION public.check_duplicate_active_subscription()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  -- Only check when setting estado to 'activa'
  IF NEW.estado <> 'activa' THEN
    RETURN NEW;
  END IF;

  -- Skip if this is an UPDATE and was already activa (no state change)
  IF TG_OP = 'UPDATE' AND OLD.estado = 'activa' THEN
    RETURN NEW;
  END IF;

  -- Check for existing active subscription with same alumno, plan, and fecha_fin
  SELECT id INTO v_existing_id
  FROM public.suscripciones
  WHERE alumno_id = NEW.alumno_id
    AND plan_id = NEW.plan_id
    AND fecha_fin = NEW.fecha_fin
    AND estado = 'activa'
    AND cancelada_at IS NULL
    AND id <> NEW.id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_SUB: El alumno ya tiene una suscripción activa para este plan y período (sub existente: %)', v_existing_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to prevent duplicate active subscriptions
CREATE TRIGGER prevent_duplicate_active_subscription
  BEFORE INSERT OR UPDATE ON public.suscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.check_duplicate_active_subscription();
