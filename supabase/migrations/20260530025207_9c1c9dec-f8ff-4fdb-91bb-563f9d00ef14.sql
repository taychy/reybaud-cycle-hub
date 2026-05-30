
-- 1. Add categoria column to planes
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'otro';

COMMENT ON COLUMN public.planes.categoria IS 'Categoría del plan para reglas de exclusividad: grupal, pista, asesoria, pausa, otro. Solo un plan ''grupal'' puede estar activo por alumno a la vez.';

-- 2. Backfill known plans by name
UPDATE public.planes SET categoria = 'grupal'
  WHERE nombre IN (
    'Pase Libre Mensual',
    'Grupal 1x por semana',
    'Grupal 2x por semana',
    'Grupo de formacion ciclista-Nivel inicial',
    'Plan Grupal a Distancia'
  );

UPDATE public.planes SET categoria = 'pista' WHERE nombre ILIKE 'Pista%';

UPDATE public.planes SET categoria = 'asesoria'
  WHERE nombre ILIKE 'Asesor%a Personalizada%'
     OR nombre ILIKE 'Clase Personalizada%';

UPDATE public.planes SET categoria = 'pausa' WHERE nombre ILIKE 'Pausa%';

-- 3. Trigger function: prevent two operational subs in category 'grupal' with overlapping periods
CREATE OR REPLACE FUNCTION public.check_grupal_category_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text;
  v_existing record;
  v_operational text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
BEGIN
  IF NOT (NEW.estado = ANY(v_operational)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado AND OLD.plan_id = NEW.plan_id THEN
    RETURN NEW;
  END IF;

  SELECT categoria INTO v_categoria FROM public.planes WHERE id = NEW.plan_id;

  IF v_categoria IS DISTINCT FROM 'grupal' THEN
    RETURN NEW;
  END IF;

  -- Look for another operational grupal sub for same alumno with overlapping date range
  SELECT s.id, p.nombre INTO v_existing
  FROM public.suscripciones s
  JOIN public.planes p ON p.id = s.plan_id
  WHERE s.alumno_id = NEW.alumno_id
    AND s.id <> NEW.id
    AND s.estado = ANY(v_operational)
    AND s.cancelada_at IS NULL
    AND p.categoria = 'grupal'
    AND (
      NEW.fecha_fin IS NULL OR s.fecha_fin IS NULL
      OR (s.fecha_inicio <= NEW.fecha_fin AND s.fecha_fin >= NEW.fecha_inicio)
    )
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_GRUPAL_CATEGORY: El alumno ya tiene un plan grupal activo (%) en este período. Solo puede tener un plan grupal a la vez.', v_existing.nombre;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_grupal_category_conflict_trg ON public.suscripciones;
CREATE TRIGGER check_grupal_category_conflict_trg
BEFORE INSERT OR UPDATE ON public.suscripciones
FOR EACH ROW
EXECUTE FUNCTION public.check_grupal_category_conflict();
