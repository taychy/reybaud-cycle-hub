-- 1) Limpieza: deshabilitar guard de alumnos sólo durante el UPDATE
ALTER TABLE public.suscripciones DISABLE TRIGGER trg_guard_suscripcion_student_update;

UPDATE public.suscripciones s
SET estado = 'vencida',
    updated_at = now()
FROM public.planes p
WHERE s.plan_id = p.id
  AND s.estado = 'activa'
  AND s.cancelada_at IS NULL
  AND s.fecha_fin IS NOT NULL
  AND s.fecha_fin < CURRENT_DATE
  AND COALESCE(p.categoria, '') <> 'pausa';

ALTER TABLE public.suscripciones ENABLE TRIGGER trg_guard_suscripcion_student_update;

-- 2) Trigger BEFORE INSERT/UPDATE: normaliza a 'vencida' si entra activa con fecha pasada
CREATE OR REPLACE FUNCTION public.auto_expire_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text;
BEGIN
  IF NEW.estado = 'activa'
     AND NEW.cancelada_at IS NULL
     AND NEW.fecha_fin IS NOT NULL
     AND NEW.fecha_fin < CURRENT_DATE THEN

    SELECT categoria INTO v_categoria FROM public.planes WHERE id = NEW.plan_id;

    IF COALESCE(v_categoria, '') <> 'pausa' THEN
      NEW.estado := 'vencida';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Nombre con prefijo 'a_' para que corra ANTES del guard ('trg_guard_...') por orden alfabético.
DROP TRIGGER IF EXISTS trg_auto_expire_subscription ON public.suscripciones;
DROP TRIGGER IF EXISTS a_auto_expire_subscription ON public.suscripciones;
CREATE TRIGGER a_auto_expire_subscription
BEFORE INSERT OR UPDATE ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.auto_expire_subscription();

-- 3) Cron diario 05:15 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-expire-subscriptions-daily') THEN
      PERFORM cron.unschedule('auto-expire-subscriptions-daily');
    END IF;

    PERFORM cron.schedule(
      'auto-expire-subscriptions-daily',
      '15 5 * * *',
      $cron$
        UPDATE public.suscripciones s
        SET estado = 'vencida', updated_at = now()
        FROM public.planes p
        WHERE s.plan_id = p.id
          AND s.estado = 'activa'
          AND s.cancelada_at IS NULL
          AND s.fecha_fin IS NOT NULL
          AND s.fecha_fin < CURRENT_DATE
          AND COALESCE(p.categoria, '') <> 'pausa';
      $cron$
    );
  END IF;
END $$;