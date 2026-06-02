CREATE OR REPLACE FUNCTION public.check_duplicate_active_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid;
  v_operational_states text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
  v_new_categoria text;
BEGIN
  -- Only check when setting estado to an operational state
  IF NOT (NEW.estado = ANY(v_operational_states)) THEN
    RETURN NEW;
  END IF;

  -- Skip if this is an UPDATE and estado didn't change
  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  SELECT categoria INTO v_new_categoria FROM public.planes WHERE id = NEW.plan_id;

  IF v_new_categoria = 'grupal' THEN
    -- Rule: only ONE active grupal (ruta/gravel) subscription per overlapping period.
    SELECT s.id INTO v_existing_id
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    WHERE s.alumno_id = NEW.alumno_id
      AND p.categoria = 'grupal'
      AND s.estado = ANY(v_operational_states)
      AND s.cancelada_at IS NULL
      AND s.id <> NEW.id
      AND (
        -- Overlap check (treat NULL dates as open-ended)
        (s.fecha_inicio IS NULL OR NEW.fecha_fin IS NULL OR s.fecha_inicio <= NEW.fecha_fin)
        AND
        (s.fecha_fin IS NULL OR NEW.fecha_inicio IS NULL OR NEW.fecha_inicio <= s.fecha_fin)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_ACTIVE_SUB: El alumno ya tiene una suscripción grupal (ruta/gravel) activa para este período (sub existente: %)', v_existing_id;
    END IF;
  ELSE
    -- Original rule for non-grupal: same plan + same fecha_fin
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
  END IF;

  RETURN NEW;
END;
$function$;