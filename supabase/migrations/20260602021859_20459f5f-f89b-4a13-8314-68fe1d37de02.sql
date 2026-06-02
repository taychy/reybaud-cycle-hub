
-- Backfill: si cualquiera de los dos está en true, ambos quedan en true
UPDATE public.planes
SET permite_auto_cobro = true, renovacion_auto_permitida = true
WHERE permite_auto_cobro IS DISTINCT FROM renovacion_auto_permitida
  AND (permite_auto_cobro = true OR renovacion_auto_permitida = true);

-- Si ambos eran null/false, asegurar coherencia (false)
UPDATE public.planes
SET permite_auto_cobro = COALESCE(permite_auto_cobro, false),
    renovacion_auto_permitida = COALESCE(renovacion_auto_permitida, false)
WHERE permite_auto_cobro IS NULL OR renovacion_auto_permitida IS NULL;

-- Trigger de sincronización
CREATE OR REPLACE FUNCTION public.sync_planes_auto_cobro_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.permite_auto_cobro IS DISTINCT FROM NEW.renovacion_auto_permitida THEN
      -- Si alguno viene true, ambos true
      IF COALESCE(NEW.permite_auto_cobro, false) OR COALESCE(NEW.renovacion_auto_permitida, false) THEN
        NEW.permite_auto_cobro := true;
        NEW.renovacion_auto_permitida := true;
      ELSE
        NEW.permite_auto_cobro := false;
        NEW.renovacion_auto_permitida := false;
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Si cambió uno y el otro no, propagar
    IF NEW.permite_auto_cobro IS DISTINCT FROM OLD.permite_auto_cobro
       AND NEW.renovacion_auto_permitida IS NOT DISTINCT FROM OLD.renovacion_auto_permitida THEN
      NEW.renovacion_auto_permitida := NEW.permite_auto_cobro;
    ELSIF NEW.renovacion_auto_permitida IS DISTINCT FROM OLD.renovacion_auto_permitida
          AND NEW.permite_auto_cobro IS NOT DISTINCT FROM OLD.permite_auto_cobro THEN
      NEW.permite_auto_cobro := NEW.renovacion_auto_permitida;
    ELSIF NEW.permite_auto_cobro IS DISTINCT FROM NEW.renovacion_auto_permitida THEN
      -- Si cambiaron ambos a valores distintos, true gana
      IF COALESCE(NEW.permite_auto_cobro, false) OR COALESCE(NEW.renovacion_auto_permitida, false) THEN
        NEW.permite_auto_cobro := true;
        NEW.renovacion_auto_permitida := true;
      ELSE
        NEW.permite_auto_cobro := false;
        NEW.renovacion_auto_permitida := false;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_planes_auto_cobro_flags ON public.planes;
CREATE TRIGGER trg_sync_planes_auto_cobro_flags
BEFORE INSERT OR UPDATE ON public.planes
FOR EACH ROW EXECUTE FUNCTION public.sync_planes_auto_cobro_flags();
