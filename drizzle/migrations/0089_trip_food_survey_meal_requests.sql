CREATE OR REPLACE FUNCTION public.trip_food_survey_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _included boolean := false;
  _status text;
  _meta jsonb;
  _old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.data, '{}'::jsonb) ELSE '{}'::jsonb END;
  _d jsonb := COALESCE(NEW.data, '{}'::jsonb);
  _is_admin boolean := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false);
  _tipo text;
  _alerg text;
  _meals jsonb := '[]'::jsonb;
  _old_meals jsonb := COALESCE(_old->'comidas_solicitadas', '[]'::jsonb);
BEGIN
  IF NEW.step_key <> 'gastronomia' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.incluye_gastronomia, false), r.reservation_status, e.metadata
    INTO _included, _status, _meta
  FROM public.event_reservations r
  LEFT JOIN public.event_packages p ON p.id = r.package_id
  LEFT JOIN public.events e ON e.id = r.event_id
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

  -- Comidas solicitadas: solo si el paquete no incluye pensión y solo las del programa real.
  IF NOT _included AND jsonb_typeof(_d->'comidas_solicitadas') = 'array' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('fecha', m->>'fecha', 'tipo', m->>'tipo')), '[]'::jsonb)
      INTO _meals
    FROM jsonb_array_elements(_d->'comidas_solicitadas') m
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(_meta #> '{food_survey,meal_program,meals}', '[]'::jsonb)) pm
      WHERE pm->>'fecha' = m->>'fecha' AND pm->>'tipo' = m->>'tipo' AND pm->>'tipo' IN ('almuerzo', 'cena')
    );
  END IF;

  _d := _d || jsonb_build_object(
    'pension_incluida', _included,
    'pension_interes', COALESCE((_old->>'pension_interes')::boolean, false) AND NOT _included,
    'comidas_solicitadas', _meals,
    'respondido_at', COALESCE(_old->>'respondido_at', to_jsonb(now())#>>'{}'),
    'actualizado_at', to_jsonb(now())#>>'{}',
    'version', 2
  );
  IF _meals <> _old_meals THEN
    _d := _d || jsonb_build_object('comidas_solicitadas_at', to_jsonb(now())#>>'{}');
  ELSIF _old ? 'comidas_solicitadas_at' THEN
    _d := _d || jsonb_build_object('comidas_solicitadas_at', _old->'comidas_solicitadas_at');
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