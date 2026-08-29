
CREATE OR REPLACE FUNCTION public.sync_whatsapp_grupo_on_tarea_hecha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.origen = 'whatsapp_grupo'
     AND NEW.estado = 'hecha'
     AND OLD.estado <> 'hecha'
     AND COALESCE((NEW.metadata->>'auto_cancelada')::boolean, false) = false
     AND NEW.entidad_id IS NOT NULL THEN
    UPDATE public.alumnos
    SET whatsapp_grupo_confirmado = NEW.metadata->>'grupo_destino',
        whatsapp_grupo_sync_at = now(),
        whatsapp_grupo_sync_by = COALESCE(NEW.cerrada_por, auth.uid())
    WHERE id = (NEW.entidad_id)::uuid;
  END IF;
  RETURN NEW;
END;
$function$;
