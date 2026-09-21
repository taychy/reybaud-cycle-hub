-- An unpaid pause is only a checkout attempt; it must not prevent the student
-- from buying a training plan. Keep all existing protections when creating a
-- pause, and keep paid/active pauses exclusive with training plans.
CREATE OR REPLACE FUNCTION public.check_grupal_category_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria text;
  v_existing record;
  v_conflict_cats text[];
  v_operational text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
BEGIN
  IF NOT (NEW.estado = ANY(v_operational)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado AND OLD.plan_id = NEW.plan_id THEN
    RETURN NEW;
  END IF;

  SELECT categoria INTO v_categoria FROM public.planes WHERE id = NEW.plan_id;

  IF v_categoria = 'grupal' THEN
    v_conflict_cats := ARRAY['grupal','pausa'];
  ELSIF v_categoria = 'pausa' THEN
    v_conflict_cats := ARRAY['grupal','pista','asesoria','pausa'];
  ELSIF v_categoria IN ('pista','asesoria') THEN
    v_conflict_cats := ARRAY['pausa'];
  ELSE
    RETURN NEW;
  END IF;

  SELECT s.id, p.nombre, p.categoria INTO v_existing
  FROM public.suscripciones s
  JOIN public.planes p ON p.id = s.plan_id
  WHERE s.alumno_id = NEW.alumno_id
    AND s.id <> NEW.id
    AND s.estado = ANY(v_operational)
    AND s.cancelada_at IS NULL
    AND p.categoria = ANY(v_conflict_cats)
    -- When purchasing a training plan, only a paid pause is a real conflict.
    -- Pending pause checkout attempts remain protected against duplication when
    -- the new subscription is itself another pause.
    AND (p.categoria <> 'pausa' OR v_categoria = 'pausa' OR s.estado = 'activa')
    AND (
      NEW.fecha_fin IS NULL OR s.fecha_fin IS NULL
      OR (s.fecha_inicio <= NEW.fecha_fin AND s.fecha_fin >= NEW.fecha_inicio)
    )
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF v_categoria = 'pausa' THEN
      RAISE EXCEPTION 'PAUSA_BLOCKED_BY_ACTIVE_SUB: El alumno tiene un plan activo (%) que debe cancelarse para activar la pausa.', v_existing.nombre;
    ELSIF v_existing.categoria = 'pausa' THEN
      RAISE EXCEPTION 'BLOCKED_BY_ACTIVE_PAUSA: El alumno está en pausa. Hay que cancelar la pausa para activar otro plan.';
    ELSE
      RAISE EXCEPTION 'DUPLICATE_GRUPAL_CATEGORY: El alumno ya tiene un plan grupal activo (%) en este período. Solo puede tener un plan grupal a la vez.', v_existing.nombre;
    END IF;
  END IF;

  IF v_categoria = 'pausa' AND NEW.fecha_inicio IS NOT NULL AND NEW.fecha_fin IS NOT NULL THEN
    IF (NEW.fecha_fin - NEW.fecha_inicio) > 62 THEN
      RAISE EXCEPTION 'PAUSA_TOO_LONG: La pausa no puede durar más de 2 meses (62 días).';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
