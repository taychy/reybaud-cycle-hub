CREATE OR REPLACE FUNCTION public.check_duplicate_active_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Auto-heal: cerrar subs 'activa' del mismo alumno cuya fecha_fin ya venció
  -- (excepto pausas). El UPDATE cambia estado a 'vencida', que no está en
  -- v_operational_states, por lo que el trigger recursivo retorna temprano y
  -- no genera loop. No hace falta desactivar triggers.
  IF NEW.alumno_id IS NOT NULL THEN
    UPDATE public.suscripciones s
    SET estado = 'vencida',
        updated_at = now()
    FROM public.planes p
    WHERE s.plan_id = p.id
      AND s.alumno_id = NEW.alumno_id
      AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.estado = 'activa'
      AND s.cancelada_at IS NULL
      AND s.fecha_fin IS NOT NULL
      AND s.fecha_fin < CURRENT_DATE
      AND COALESCE(p.categoria, '') <> 'pausa';
  END IF;

  SELECT categoria INTO v_new_categoria FROM public.planes WHERE id = NEW.plan_id;

  IF v_new_categoria = 'asesoria' THEN
    RETURN NEW;
  END IF;

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

  IF v_new_categoria IN ('grupal','pista') THEN
    SELECT s.id, p.categoria INTO v_existing_id, v_existing_cat
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    WHERE s.alumno_id = NEW.alumno_id
      AND s.estado = ANY(v_operational_states)
      AND s.cancelada_at IS NULL
      AND s.id <> NEW.id
      AND (
        p.categoria = v_new_categoria
        OR p.categoria = 'pausa'
      )
      AND (
        (s.fecha_inicio IS NULL OR NEW.fecha_fin    IS NULL OR s.fecha_inicio <= NEW.fecha_fin)
        AND
        (s.fecha_fin    IS NULL OR NEW.fecha_inicio IS NULL OR NEW.fecha_inicio <= s.fecha_fin)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF v_existing_cat = 'pausa' THEN
        RAISE EXCEPTION 'BLOCKED_BY_ACTIVE_PAUSA: El alumno tiene una pausa activa (sub existente: %). Cancelala antes de contratar otro plan.', v_existing_id;
      ELSE
        RAISE EXCEPTION 'DUPLICATE_GRUPAL_CATEGORY: El alumno ya tiene otra suscripción % vigente (sub existente: %)', v_new_categoria, v_existing_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;