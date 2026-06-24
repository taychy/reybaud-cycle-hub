-- 1) Cleanup retroactivo (bypassa el guard usando session_replication_role)
SET session_replication_role = replica;
UPDATE public.suscripciones
SET estado = 'cancelada'
WHERE estado = 'activa'
  AND cancelada_at IS NOT NULL
  AND fecha_fin IS NOT NULL
  AND fecha_fin < CURRENT_DATE;
SET session_replication_role = origin;

-- 2) Trigger defensivo: al setear cancelada_at, si fecha_fin ya pasó, marcar 'cancelada'
CREATE OR REPLACE FUNCTION public.sync_cancelada_estado_on_expired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cancelada_at IS NOT NULL
     AND NEW.estado = 'activa'
     AND NEW.fecha_fin IS NOT NULL
     AND NEW.fecha_fin < CURRENT_DATE THEN
    NEW.estado := 'cancelada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cancelada_estado_on_expired ON public.suscripciones;
CREATE TRIGGER trg_sync_cancelada_estado_on_expired
BEFORE INSERT OR UPDATE OF cancelada_at, fecha_fin ON public.suscripciones
FOR EACH ROW
EXECUTE FUNCTION public.sync_cancelada_estado_on_expired();