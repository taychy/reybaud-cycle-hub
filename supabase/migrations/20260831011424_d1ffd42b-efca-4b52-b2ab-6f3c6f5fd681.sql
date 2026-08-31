CREATE OR REPLACE FUNCTION public.trg_alumnos_grupo_whatsapp_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.grupo IS DISTINCT FROM OLD.grupo THEN
    PERFORM public.reconciliar_tarea_whatsapp_grupo(NEW.id, OLD.grupo::text, NEW.grupo::text, auth.uid());
  END IF;
  RETURN NULL;
END;
$function$;