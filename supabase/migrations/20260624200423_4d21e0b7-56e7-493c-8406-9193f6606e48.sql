
-- Trigger: cuando alumnos.estado pasa a 'inactivo', cancelar subs operativas vivas.
CREATE OR REPLACE FUNCTION public.cancel_subs_on_alumno_inactivo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'inactivo' AND (OLD.estado IS DISTINCT FROM 'inactivo') THEN
    UPDATE public.suscripciones
       SET cancelada_at = COALESCE(cancelada_at, now()),
           cancelada_motivo = COALESCE(cancelada_motivo, 'baja_alumno_auto'),
           auto_renovacion = false,
           auto_cobro_activo = false,
           updated_at = now()
     WHERE alumno_id = NEW.id
       AND cancelada_at IS NULL
       AND estado IN ('activa','pendiente','pendiente_verificacion','pausa');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_subs_on_alumno_inactivo ON public.alumnos;
CREATE TRIGGER trg_cancel_subs_on_alumno_inactivo
AFTER UPDATE OF estado ON public.alumnos
FOR EACH ROW
EXECUTE FUNCTION public.cancel_subs_on_alumno_inactivo();

-- Limpieza retroactiva: alumnos ya inactivos con subs operativas vivas.
UPDATE public.suscripciones s
   SET cancelada_at = COALESCE(s.cancelada_at, now()),
       cancelada_motivo = COALESCE(s.cancelada_motivo, 'baja_alumno_auto_retro'),
       auto_renovacion = false,
       auto_cobro_activo = false,
       updated_at = now()
  FROM public.alumnos a
 WHERE a.id = s.alumno_id
   AND a.estado = 'inactivo'
   AND s.cancelada_at IS NULL
   AND s.estado IN ('activa','pendiente','pendiente_verificacion','pausa');
