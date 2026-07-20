
ALTER TABLE public.reservas_turnera
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_sync_status text,
  ADD COLUMN IF NOT EXISTS google_sync_error text,
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;

CREATE OR REPLACE FUNCTION public.trigger_sync_turnera_gcal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_action text;
  v_should_sync boolean := false;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

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
      OLD.estado_operativo IS DISTINCT FROM NEW.estado_operativo OR
      OLD.google_event_id IS NULL
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
      url := v_url || '/functions/v1/sync-turnera-google-calendar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'reservation_id', NEW.id,
        'action', v_action
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- No romper la operación si falla el trigger
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_turnera_gcal ON public.reservas_turnera;
CREATE TRIGGER trg_sync_turnera_gcal
AFTER INSERT OR UPDATE ON public.reservas_turnera
FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_turnera_gcal();

-- Guardar el calendario compartido en app_config para referencia (no crítico)
INSERT INTO public.app_config (key, value)
VALUES ('google_calendar_turnera_id', to_jsonb('c_bb8012c23102415cdee4dd2209226311d060fae683d1482108b0580cd23fcf54@group.calendar.google.com'::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
