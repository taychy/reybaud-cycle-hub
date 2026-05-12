-- Trigger: al crear una sub nueva, marcar como 'vencida' las subs anteriores
-- del mismo alumno+plan cuya fecha_fin ya pasó y siguen marcadas como activas.
CREATE OR REPLACE FUNCTION public.close_previous_subscription_on_new()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo aplica si la nueva sub es operativa (no cancelada de entrada)
  IF NEW.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado')
     AND NEW.cancelada_at IS NULL THEN

    UPDATE public.suscripciones
    SET estado = 'vencida',
        updated_at = now()
    WHERE alumno_id = NEW.alumno_id
      AND plan_id   = NEW.plan_id
      AND id <> NEW.id
      AND estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado')
      AND cancelada_at IS NULL
      AND fecha_fin < CURRENT_DATE
      AND (NEW.fecha_inicio IS NULL OR fecha_fin < NEW.fecha_inicio);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_previous_subscription_on_new ON public.suscripciones;

CREATE TRIGGER trg_close_previous_subscription_on_new
AFTER INSERT ON public.suscripciones
FOR EACH ROW
EXECUTE FUNCTION public.close_previous_subscription_on_new();