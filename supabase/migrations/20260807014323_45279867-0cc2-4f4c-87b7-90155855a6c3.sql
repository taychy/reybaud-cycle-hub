CREATE OR REPLACE FUNCTION public.normalize_suscripcion_periodo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cat text;
  v_cerrado boolean;
BEGIN
  IF NEW.fecha_inicio IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.categoria, COALESCE(p.es_programa_cerrado, false)
    INTO v_cat, v_cerrado
  FROM public.planes p
  WHERE p.id = NEW.plan_id;

  -- Pausas y programas cerrados conservan sus fechas propias
  IF COALESCE(v_cat, '') = 'pausa' OR COALESCE(v_cerrado, false) THEN
    RETURN NEW;
  END IF;

  NEW.fecha_inicio := date_trunc('month', NEW.fecha_inicio)::date;
  NEW.fecha_fin := (date_trunc('month', NEW.fecha_inicio) + INTERVAL '1 month - 1 day')::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_suscripcion_periodo ON public.suscripciones;
CREATE TRIGGER trg_normalize_suscripcion_periodo
BEFORE INSERT OR UPDATE OF fecha_inicio, fecha_fin, plan_id ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.normalize_suscripcion_periodo();