
CREATE OR REPLACE FUNCTION public.cancel_subs_on_alumno_inactivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'inactivo' AND (OLD.estado IS DISTINCT FROM 'inactivo') THEN
    UPDATE public.suscripciones
       SET estado = 'cancelada',
           cancelada_at = COALESCE(cancelada_at, now()),
           cancelada_motivo = COALESCE(cancelada_motivo, 'baja_alumno_auto'),
           auto_renovacion = false,
           auto_cobro_activo = false,
           updated_at = now()
     WHERE alumno_id = NEW.id
       AND estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.suscripciones DISABLE TRIGGER trg_guard_suscripcion_student_update;

UPDATE public.suscripciones
   SET estado = 'cancelada',
       updated_at = now()
 WHERE cancelada_at IS NOT NULL
   AND estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado','pausa');

ALTER TABLE public.suscripciones ENABLE TRIGGER trg_guard_suscripcion_student_update;
