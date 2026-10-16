CREATE OR REPLACE FUNCTION public.trip_choice_survey_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _key text;
  _status text;
  _meta jsonb;
  _survey jsonb;
  _opt jsonb;
  _ans text;
  _old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.data, '{}'::jsonb) ELSE '{}'::jsonb END;
  _is_admin boolean := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
BEGIN
  IF NEW.step_key NOT LIKE 'encuesta_%' THEN RETURN NEW; END IF;
  _key := substring(NEW.step_key from 10);

  SELECT r.reservation_status, e.metadata INTO _status, _meta
  FROM public.event_reservations r JOIN public.events e ON e.id = r.event_id
  WHERE r.id = NEW.reservation_id;

  IF _status IS NULL THEN RAISE EXCEPTION 'reserva_no_activa'; END IF;
  IF NOT _is_admin AND _status IN ('cancelada', 'rechazada') THEN RAISE EXCEPTION 'reserva_no_activa'; END IF;

  SELECT s INTO _survey FROM jsonb_array_elements(COALESCE(_meta->'choice_surveys', '[]'::jsonb)) s
  WHERE s->>'key' = _key LIMIT 1;
  IF _survey IS NULL OR COALESCE((_survey->>'enabled')::boolean, false) = false THEN
    RAISE EXCEPTION 'encuesta_invalido';
  END IF;

  _ans := NULLIF(COALESCE(NEW.data, '{}'::jsonb)->>'respuesta', '');
  IF _ans IS NULL THEN RAISE EXCEPTION 'respuesta_invalido'; END IF;
  SELECT o INTO _opt FROM jsonb_array_elements(COALESCE(_survey->'options', '[]'::jsonb)) o WHERE o->>'value' = _ans LIMIT 1;
  IF _opt IS NULL THEN RAISE EXCEPTION 'respuesta_invalido'; END IF;

  NEW.data := jsonb_build_object(
    'respuesta', _ans,
    'requiere_seguimiento', COALESCE((_opt->>'needs_follow_up')::boolean, false),
    'respondido_at', COALESCE(_old->>'respondido_at', to_jsonb(now())#>>'{}'),
    'actualizado_at', to_jsonb(now())#>>'{}',
    'respuesta_anterior', CASE WHEN _old->>'respuesta' IS DISTINCT FROM _ans THEN _old->'respuesta' ELSE _old->'respuesta_anterior' END,
    'version', 1
  );
  NEW.completed := NOT COALESCE((_opt->>'needs_follow_up')::boolean, false);
  NEW.needs_advice := COALESCE((_opt->>'needs_follow_up')::boolean, false);
  NEW.file_url := NULL;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_choice_survey_guard ON public.reservation_checklist_data;
CREATE TRIGGER trg_trip_choice_survey_guard
BEFORE INSERT OR UPDATE ON public.reservation_checklist_data
FOR EACH ROW EXECUTE FUNCTION public.trip_choice_survey_guard();