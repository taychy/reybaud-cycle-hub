CREATE OR REPLACE FUNCTION public.guard_mp_movement_gasto_vs_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.gasto_id IS NOT NULL AND NEW.gasto_id IS DISTINCT FROM OLD.gasto_id THEN
    IF EXISTS (SELECT 1 FROM public.devoluciones d WHERE d.mp_movement_id = NEW.id) THEN
      RAISE EXCEPTION 'Ese egreso ya está registrado como devolución a un alumno';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mp_movement_gasto_vs_devolucion ON public.mp_account_movements;
CREATE TRIGGER trg_guard_mp_movement_gasto_vs_devolucion
BEFORE UPDATE ON public.mp_account_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_mp_movement_gasto_vs_devolucion();

CREATE OR REPLACE FUNCTION public.guard_devolucion_mp_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.mp_movement_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.mp_account_movements m
      WHERE m.id = NEW.mp_movement_id AND m.gasto_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Ese egreso ya fue convertido en gasto';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_devolucion_mp_movement ON public.devoluciones;
CREATE TRIGGER trg_guard_devolucion_mp_movement
BEFORE INSERT OR UPDATE ON public.devoluciones
FOR EACH ROW EXECUTE FUNCTION public.guard_devolucion_mp_movement();