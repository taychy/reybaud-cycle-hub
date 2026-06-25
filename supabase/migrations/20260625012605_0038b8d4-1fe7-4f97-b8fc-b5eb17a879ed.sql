CREATE OR REPLACE FUNCTION public.check_duplicate_active_subscription()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid;
  v_existing_cat text;
  v_operational_states text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
  v_new_categoria text;
BEGIN
  IF NOT (NEW.estado = ANY(v_operational_states)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  SELECT categoria INTO v_new_categoria FROM public.planes WHERE id = NEW.plan_id;

  -- Asesoría: nunca bloquea, puede convivir con todo
  IF v_new_categoria = 'asesoria' THEN
    RETURN NEW;
  END IF;

  -- Pausa / Plan reducido: no puede convivir con NINGUNA otra suscripción operativa
  IF v_new_categoria = 'pausa' THEN
    SELECT s.id INTO v_existing_id
    FROM public.suscripciones s
    WHERE s.alumno_id = NEW.alumno_id
      AND s.estado = ANY(v_operational_states)
      AND s.cancelada_at IS NULL
      AND s.id <> NEW.id
      AND (
        (s.fecha_inicio IS NULL OR NEW.fecha_fin    IS NULL OR s.fecha_inicio <= NEW.fecha_fin)
        AND
        (s.fecha_fin    IS NULL OR NEW.fecha_inicio IS NULL OR NEW.fecha_inicio <= s.fecha_fin)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_ACTIVE_SUB: El alumno tiene otra suscripción vigente. El Plan Reducido (pausa) no puede convivir con otros planes (sub existente: %)', v_existing_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Grupal o Pista: no puede convivir con OTRA de la misma modalidad, NI con una pausa vigente
  IF v_new_categoria IN ('grupal','pista') THEN
    SELECT s.id, p.categoria INTO v_existing_id, v_existing_cat
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    WHERE s.alumno_id = NEW.alumno_id
      AND s.estado = ANY(v_operational_states)
      AND s.cancelada_at IS NULL
      AND s.id <> NEW.id
      AND (p.categoria = v_new_categoria OR p.categoria = 'pausa')
      AND (
        (s.fecha_inicio IS NULL OR NEW.fecha_fin    IS NULL OR s.fecha_inicio <= NEW.fecha_fin)
        AND
        (s.fecha_fin    IS NULL OR NEW.fecha_inicio IS NULL OR NEW.fecha_inicio <= s.fecha_fin)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF v_existing_cat = 'pausa' THEN
        RAISE EXCEPTION 'DUPLICATE_ACTIVE_SUB: El alumno tiene un Plan Reducido (pausa) vigente, no se puede sumar otra suscripción (sub existente: %)', v_existing_id;
      ELSE
        RAISE EXCEPTION 'DUPLICATE_ACTIVE_SUB: El alumno ya tiene una suscripción % vigente en este período (sub existente: %)', v_new_categoria, v_existing_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Otras categorías ("otro", etc): regla original (mismo plan + misma fecha_fin)
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