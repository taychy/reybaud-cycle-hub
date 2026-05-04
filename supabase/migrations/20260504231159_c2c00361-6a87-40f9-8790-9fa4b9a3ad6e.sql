
CREATE OR REPLACE FUNCTION public.check_duplicate_active_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid;
  v_operational_states text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
BEGIN
  -- Only check when setting estado to an operational state
  IF NOT (NEW.estado = ANY(v_operational_states)) THEN
    RETURN NEW;
  END IF;

  -- Skip if this is an UPDATE and estado didn't change
  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Check for existing operational subscription with same alumno, plan, and fecha_fin
  SELECT id INTO v_existing_id
  FROM public.suscripciones
  WHERE alumno_id = NEW.alumno_id
    AND plan_id = NEW.plan_id
    AND fecha_fin IS NOT DISTINCT FROM NEW.fecha_fin
    AND estado = ANY(v_operational_states)
    AND cancelada_at IS NULL
    AND id <> NEW.id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_SUB: El alumno ya tiene una suscripción operativa para este plan y período (sub existente: %)', v_existing_id;
  END IF;

  RETURN NEW;
END;
$function$;
