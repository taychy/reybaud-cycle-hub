CREATE OR REPLACE FUNCTION public.trip_food_survey_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _included boolean := false;
  _status text;
  _old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.data, '{}'::jsonb) ELSE '{}'::jsonb END;
  _d jsonb := COALESCE(NEW.data, '{}'::jsonb);
  _is_admin boolean := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
  _tipo text;
  _alerg text;
  _want boolean;
  _was boolean;
BEGIN
  IF NEW.step_key <> 'gastronomia' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.incluye_gastronomia, false), r.reservation_status
    INTO _included, _status
  FROM public.event_reservations r
  LEFT JOIN public.event_packages p ON p.id = r.package_id
  WHERE r.id = NEW.reservation_id;

  IF NOT _is_admin AND _status IN ('cancelada', 'rechazada') THEN
    RAISE EXCEPTION 'reserva_no_activa';
  END IF;

  _tipo := _d->>'tipo_alimentacion';
  IF _tipo IS NOT NULL AND _tipo NOT IN ('normal', 'vegetariana', 'vegana', 'otra') THEN
    RAISE EXCEPTION 'tipo_alimentacion_invalido';
  END IF;
  _alerg := _d->>'tiene_alergias';
  IF _alerg IS NOT NULL AND _alerg NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'tiene_alergias_invalido';
  END IF;

  _want := COALESCE((_d->>'pension_interes')::boolean, false) AND NOT _included;
  _was := COALESCE((_old->>'pension_interes')::boolean, false);

  _d := _d || jsonb_build_object(
    'pension_incluida', _included,
    'pension_interes', _want,
    'respondido_at', COALESCE(_old->>'respondido_at', to_jsonb(now())#>>'{}'),
    'actualizado_at', to_jsonb(now())#>>'{}',
    'version', 1
  );

  IF _want AND NOT _was THEN
    _d := _d || jsonb_build_object('pension_solicitada_at', to_jsonb(now())#>>'{}');
  ELSIF _want AND _was THEN
    _d := _d || jsonb_build_object('pension_solicitada_at', _old->'pension_solicitada_at');
  ELSIF NOT _want AND _was THEN
    _d := _d || jsonb_build_object('pension_retirada_at', to_jsonb(now())#>>'{}');
  END IF;

  -- La gestión administrativa de la solicitud solo la cambia Administración.
  IF NOT _is_admin THEN
    _d := _d - 'pension_gestion' - 'pension_gestion_at';
    IF _old ? 'pension_gestion' THEN
      _d := _d || jsonb_build_object('pension_gestion', _old->'pension_gestion', 'pension_gestion_at', _old->'pension_gestion_at');
    END IF;
  END IF;

  NEW.data := _d;
  NEW.completed := (_tipo IS NOT NULL AND _alerg IS NOT NULL);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_food_survey_guard ON public.reservation_checklist_data;
CREATE TRIGGER trg_trip_food_survey_guard
BEFORE INSERT OR UPDATE ON public.reservation_checklist_data
FOR EACH ROW EXECUTE FUNCTION public.trip_food_survey_guard();