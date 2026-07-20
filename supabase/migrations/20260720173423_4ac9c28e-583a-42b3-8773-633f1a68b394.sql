
CREATE OR REPLACE FUNCTION public.trigger_sync_turnera_gcal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_should_sync boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'upsert';
    v_should_sync := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado_operativo IN ('cancelada','cancelada_por_admin')
       AND OLD.estado_operativo NOT IN ('cancelada','cancelada_por_admin') THEN
      v_action := 'delete';
      v_should_sync := true;
    ELSIF NEW.estado_operativo NOT IN ('cancelada','cancelada_por_admin') AND (
      OLD.fecha IS DISTINCT FROM NEW.fecha OR
      OLD.hora_inicio IS DISTINCT FROM NEW.hora_inicio OR
      OLD.hora_fin IS DISTINCT FROM NEW.hora_fin OR
      OLD.coach_id IS DISTINCT FROM NEW.coach_id OR
      OLD.servicio_id IS DISTINCT FROM NEW.servicio_id OR
      OLD.sede_id IS DISTINCT FROM NEW.sede_id OR
      OLD.nombre IS DISTINCT FROM NEW.nombre OR
      OLD.apellido IS DISTINCT FROM NEW.apellido OR
      OLD.email IS DISTINCT FROM NEW.email OR
      OLD.celular IS DISTINCT FROM NEW.celular OR
      OLD.nota IS DISTINCT FROM NEW.nota OR
      OLD.estado_operativo IS DISTINCT FROM NEW.estado_operativo
    ) THEN
      v_action := 'upsert';
      v_should_sync := true;
    END IF;
  END IF;

  IF NOT v_should_sync THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://tgqfakfloonbunwkdoug.supabase.co/functions/v1/sync-turnera-google-calendar',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncWZha2Zsb29uYnVud2tkb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDcwNjcsImV4cCI6MjA4NzUyMzA2N30.wESViBAO2oP0aTSIrgXVkIS8qJXgW4f0GtKWShHuf_o"}'::jsonb,
      body := jsonb_build_object(
        'reservation_id', NEW.id,
        'action', v_action
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
