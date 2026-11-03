-- Encuesta de comidas adicionales (interés, nunca compra). Configurable por viaje en
-- events.metadata.food_survey.extra_meal_survey = {enabled, price, currency, window_start, window_end, specials:[{fecha,tipo,nombre}]}.

CREATE OR REPLACE FUNCTION public._extra_meal_compute(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  s date; e date; ws date; we date; n jsonb; rg jsonb; sp jsonb;
  bef boolean := false; aft boolean := false; t text; q int;
  slots jsonb := '[]'::jsonb; outv jsonb := '[]'::jsonb; warns jsonb := '[]'::jsonb;
  contracted text[] := '{}'; ambiguous text[] := '{}'; dts text[]; m text[]; txt text;
  sl jsonb; st text; det text; k text; yr int; specials_c text[] := '{}';
BEGIN
  BEGIN s := (p->>'start')::date; e := (p->>'end')::date;
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('blocked','fechas_no_validadas','slots','[]'::jsonb,'warnings','[]'::jsonb); END;
  IF s IS NULL OR e IS NULL OR s > e THEN
    RETURN jsonb_build_object('blocked','fechas_no_validadas','slots','[]'::jsonb,'warnings','[]'::jsonb);
  END IF;
  ws := COALESCE(NULLIF(p#>>'{cfg,window_start}','')::date, s - 1);
  we := COALESCE(NULLIF(p#>>'{cfg,window_end}','')::date, e + 1);
  yr := extract(year FROM s)::int;

  FOR n IN SELECT * FROM jsonb_array_elements(COALESCE(p->'nights','[]'::jsonb)) LOOP
    t := n->>'timing'; q := COALESCE((n->>'cantidad')::int, 0);
    IF t = 'antes' AND q = 1 THEN bef := true;
    ELSIF t = 'despues' AND q = 1 THEN aft := true;
    ELSIF t = 'ambas' AND q = 2 THEN bef := true; aft := true;
    ELSIF t IN ('antes','despues','ambas') THEN
      RETURN jsonb_build_object('blocked','cantidad_noches_inconsistente','slots','[]'::jsonb,'warnings','[]'::jsonb);
    ELSE
      RETURN jsonb_build_object('blocked','noche_sin_fecha','slots','[]'::jsonb,'warnings','[]'::jsonb);
    END IF;
  END LOOP;

  IF bef THEN slots := slots || jsonb_build_object('tipo','cena','fecha',to_char(s-1,'YYYY-MM-DD'),'motivo','noche_extra_antes'); END IF;
  IF aft THEN slots := slots || jsonb_build_object('tipo','cena','fecha',to_char(e,'YYYY-MM-DD'),'motivo','noche_extra_despues'); END IF;
  slots := slots || jsonb_build_object('tipo','almuerzo','fecha',to_char(s - bef::int,'YYYY-MM-DD'),'motivo','llegada');
  IF (e + aft::int) <> (s - bef::int) THEN
    slots := slots || jsonb_build_object('tipo','almuerzo','fecha',to_char(e + aft::int,'YYYY-MM-DD'),'motivo','salida');
  END IF;

  FOR sl IN SELECT * FROM jsonb_array_elements(slots) LOOP
    IF (sl->>'fecha')::date < ws OR (sl->>'fecha')::date > we THEN
      RETURN jsonb_build_object('blocked','fecha_fuera_de_alcance','slots','[]'::jsonb,'warnings','[]'::jsonb);
    END IF;
  END LOOP;

  -- Comidas regulares ya contratadas: fechas sólo si son inequívocas en la nota.
  FOR rg IN SELECT * FROM jsonb_array_elements(COALESCE(p->'regular','[]'::jsonb)) LOOP
    txt := regexp_replace(COALESCE(rg->>'notas',''), '^.*:', '');
    dts := '{}';
    FOR m IN SELECT regexp_matches(txt, '(\d{1,2})/(\d{1,2})(?:/\d{2,4})?', 'g') LOOP
      BEGIN
        k := (rg->>'tipo') || '|' || to_char(make_date(yr, m[2]::int, m[1]::int),'YYYY-MM-DD');
        IF NOT k = ANY(dts) THEN dts := dts || k; END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
    IF cardinality(dts) = COALESCE((rg->>'cantidad')::int,0) AND cardinality(dts) > 0 THEN
      contracted := contracted || dts;
    ELSE
      ambiguous := ambiguous || (rg->>'tipo');
      warns := warns || jsonb_build_object('code','compra_sin_fecha','tipo',rg->>'tipo','cantidad',rg->'cantidad');
    END IF;
  END LOOP;
  SELECT COALESCE(array_agg(x),'{}') INTO specials_c FROM jsonb_array_elements_text(COALESCE(p->'specials_contracted','[]'::jsonb)) x;

  FOR sl IN SELECT * FROM jsonb_array_elements(slots) LOOP
    k := (sl->>'tipo') || '|' || (sl->>'fecha'); st := 'ofrecible'; det := NULL;
    SELECT x INTO sp FROM jsonb_array_elements(COALESCE(p#>'{cfg,specials}','[]'::jsonb)) x
      WHERE x->>'fecha' = sl->>'fecha' AND x->>'tipo' = sl->>'tipo' LIMIT 1;
    IF k = ANY(contracted) THEN st := 'contratada';
    ELSIF sp IS NOT NULL THEN
      det := sp->>'nombre';
      st := CASE WHEN (sl->>'fecha') = ANY(specials_c) THEN 'contratada' ELSE 'especial' END;
    ELSIF (sl->>'tipo') = ANY(ambiguous) THEN st := 'revision';
    ELSIF COALESCE((p->>'pc')::boolean,false)
      AND (sl->>'fecha')::date BETWEEN s AND e
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p#>'{cfg,program}','[]'::jsonb)) x
                 WHERE x->>'fecha' = sl->>'fecha' AND x->>'tipo' = sl->>'tipo') THEN st := 'incluida';
    END IF;
    sp := NULL;
    outv := outv || (sl || jsonb_build_object('status', st, 'detalle', det));
  END LOOP;

  RETURN jsonb_build_object('blocked', NULL, 'slots', outv, 'warnings', warns,
    'stay', jsonb_build_object('start',to_char(s,'YYYY-MM-DD'),'end',to_char(e,'YYYY-MM-DD')));
END $$;

CREATE OR REPLACE FUNCTION public._extra_meal_slots(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.event_reservations%ROWTYPE; fs jsonb; cfg jsonb; stay jsonb; pc boolean; pname text;
  nights jsonb; regular jsonb; specials jsonb; res jsonb; alm uuid; cen uuid;
BEGIN
  SELECT * INTO r FROM public.event_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('blocked','no_encontrada','slots','[]'::jsonb); END IF;
  SELECT metadata->'food_survey' INTO fs FROM public.events WHERE id = r.event_id;
  cfg := fs->'extra_meal_survey';
  IF COALESCE((cfg->>'enabled')::boolean,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('blocked','no_habilitada','slots','[]'::jsonb);
  END IF;
  IF r.reservation_status IN ('cancelada','rechazada') THEN
    RETURN jsonb_build_object('blocked','cancelada','slots','[]'::jsonb);
  END IF;
  stay := public._trip_food_stay(r.id);
  SELECT COALESCE(p.incluye_gastronomia,false), p.nombre INTO pc, pname FROM public.event_packages p WHERE p.id = r.package_id;
  alm := NULLIF(fs#>>'{meal_program,almuerzo_addon_id}','')::uuid;
  cen := NULLIF(fs#>>'{meal_program,cena_addon_id}','')::uuid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('timing',ra.noche_timing,'cantidad',ra.cantidad)),'[]'::jsonb) INTO nights
  FROM public.reservation_addons ra JOIN public.event_addons a ON a.id = ra.addon_id
  WHERE ra.reservation_id = r.id AND a.nombre ILIKE 'noche extra%' AND ra.cantidad > 0;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo', CASE WHEN ra.addon_id = alm THEN 'almuerzo' ELSE 'cena' END,
    'cantidad', ra.cantidad, 'notas', ra.notas)),'[]'::jsonb) INTO regular
  FROM public.reservation_addons ra WHERE ra.reservation_id = r.id AND ra.addon_id IN (alm, cen) AND ra.cantidad > 0;

  SELECT COALESCE(jsonb_agg(x->>'fecha'),'[]'::jsonb) INTO specials
  FROM jsonb_array_elements(COALESCE(cfg->'specials','[]'::jsonb)) x
  WHERE EXISTS(SELECT 1 FROM public.reservation_addons ra JOIN public.event_addons a ON a.id = ra.addon_id
               WHERE ra.reservation_id = r.id AND ra.cantidad > 0 AND a.event_id = r.event_id
                 AND lower(btrim(a.nombre)) = lower(btrim(x->>'nombre')));

  IF stay IS NULL THEN
    res := jsonb_build_object('blocked','fechas_no_validadas','slots','[]'::jsonb,'warnings','[]'::jsonb);
  ELSE
    res := public._extra_meal_compute(jsonb_build_object('start',stay->>'start','end',stay->>'end','pc',pc,
      'nights',nights,'regular',regular,'specials_contracted',specials,
      'cfg', jsonb_build_object('window_start',cfg->>'window_start','window_end',cfg->>'window_end',
        'specials',COALESCE(cfg->'specials','[]'::jsonb),'program',COALESCE(fs#>'{meal_program,meals}','[]'::jsonb))));
  END IF;
  RETURN res || jsonb_build_object('pc',pc,'package',pname,
    'price',COALESCE((cfg->>'price')::numeric, (fs->>'meal_interest_price')::numeric),
    'currency',COALESCE(cfg->>'currency','ARS'));
END $$;

CREATE OR REPLACE FUNCTION public.get_extra_meal_survey(p_reservation_id uuid, p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c jsonb;
BEGIN
  IF NOT public._trip_day_access(p_reservation_id, p_token) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT data INTO c FROM public.reservation_checklist_data
   WHERE reservation_id = p_reservation_id AND step_key = 'encuesta_comidas_extra_san_luis';
  RETURN public._extra_meal_slots(p_reservation_id) || jsonb_build_object('answer', c);
END $$;

CREATE OR REPLACE FUNCTION public.save_extra_meal_survey(p_reservation_id uuid, p_token text, p_requested jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.event_reservations%ROWTYPE; info jsonb; prev jsonb; req jsonb := '[]'::jsonb; it jsonb; sl jsonb;
  keys text[] := '{}'; prevkeys text[]; k text; now_txt text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
BEGIN
  IF NOT public._trip_day_access(p_reservation_id, p_token) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_requested IS NULL OR jsonb_typeof(p_requested) <> 'array' OR jsonb_array_length(p_requested) > 10 THEN
    RAISE EXCEPTION 'Solicitud inválida';
  END IF;
  SELECT * INTO r FROM public.event_reservations WHERE id = p_reservation_id FOR UPDATE;
  info := public._extra_meal_slots(r.id);
  IF info->>'blocked' IS NOT NULL THEN RAISE EXCEPTION 'No se puede guardar: %', info->>'blocked'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_requested) LOOP
    k := (it->>'tipo') || '|' || (it->>'fecha');
    IF k = ANY(keys) THEN CONTINUE; END IF;
    SELECT x INTO sl FROM jsonb_array_elements(info->'slots') x
     WHERE x->>'tipo' = it->>'tipo' AND x->>'fecha' = it->>'fecha' LIMIT 1;
    IF sl IS NULL OR sl->>'status' <> 'ofrecible' THEN RAISE EXCEPTION 'Comida no disponible para solicitar: %', k; END IF;
    keys := keys || k;
    req := req || jsonb_build_object('fecha', sl->>'fecha', 'tipo', sl->>'tipo', 'motivo', sl->>'motivo');
    sl := NULL;
  END LOOP;

  SELECT data INTO prev FROM public.reservation_checklist_data
   WHERE reservation_id = r.id AND step_key = 'encuesta_comidas_extra_san_luis' FOR UPDATE;
  IF prev IS NOT NULL THEN
    SELECT COALESCE(array_agg((x->>'tipo')||'|'||(x->>'fecha') ORDER BY 1),'{}') INTO prevkeys FROM jsonb_array_elements(COALESCE(prev->'requested','[]'::jsonb)) x;
    IF prevkeys = (SELECT COALESCE(array_agg(z ORDER BY z),'{}') FROM unnest(keys) z) THEN
      RETURN jsonb_build_object('ok',true,'unchanged',true,'data',prev);
    END IF;
  END IF;

  PERFORM set_config('app.extra_meal_save','on',true);
  INSERT INTO public.reservation_checklist_data (reservation_id, alumno_id, step_key, completed, needs_advice, data)
  VALUES (r.id, r.alumno_id, 'encuesta_comidas_extra_san_luis', true, jsonb_array_length(req) > 0,
    jsonb_build_object('version',1,'requested',req,'respondido_at',COALESCE(prev->>'respondido_at',now_txt),
      'actualizado_at',now_txt,'precio_referencia',info->'price','moneda',info->'currency',
      'tipo','solicitud_interes','genera_cobro',false))
  ON CONFLICT (reservation_id, step_key) DO UPDATE SET completed = EXCLUDED.completed,
    needs_advice = EXCLUDED.needs_advice, data = EXCLUDED.data, updated_at = now();
  PERFORM set_config('app.extra_meal_save','off',true);
  RETURN jsonb_build_object('ok',true,'unchanged',false,'count',jsonb_array_length(req));
END $$;

CREATE OR REPLACE FUNCTION public.trg_extra_meal_survey_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.step_key = 'encuesta_comidas_extra_san_luis')
     OR (TG_OP <> 'DELETE' AND (NEW.step_key = 'encuesta_comidas_extra_san_luis'
         OR (TG_OP = 'UPDATE' AND OLD.step_key = 'encuesta_comidas_extra_san_luis'))) THEN
    IF COALESCE(current_setting('app.extra_meal_save', true),'') <> 'on' AND NOT public._rescheduling_admin() THEN
      RAISE EXCEPTION 'Esta encuesta solo se guarda desde su formulario validado';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_extra_meal_survey_guard ON public.reservation_checklist_data;
CREATE TRIGGER trg_extra_meal_survey_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reservation_checklist_data
FOR EACH ROW EXECUTE FUNCTION public.trg_extra_meal_survey_guard();

CREATE OR REPLACE FUNCTION public.admin_extra_meal_survey_report(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE out jsonb := '[]'::jsonb; r record; info jsonb; c record;
BEGIN
  IF NOT public._rescheduling_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  FOR r IN SELECT er.id, COALESCE(a.nombre, er.external_first_name) nombre, COALESCE(a.apellido, er.external_last_name) apellido
    FROM public.event_reservations er LEFT JOIN public.alumnos a ON a.id = er.alumno_id
    WHERE er.event_id = p_event_id AND er.reservation_status NOT IN ('cancelada','rechazada')
    ORDER BY 3, 2 LOOP
    info := public._extra_meal_slots(r.id);
    SELECT data, updated_at INTO c FROM public.reservation_checklist_data
      WHERE reservation_id = r.id AND step_key = 'encuesta_comidas_extra_san_luis';
    out := out || jsonb_build_object('reservation_id', r.id, 'nombre', r.nombre, 'apellido', r.apellido,
      'info', info, 'answer', c.data, 'updated_at', c.updated_at);
    c := NULL;
  END LOOP;
  RETURN out;
END $$;

REVOKE ALL ON FUNCTION public._extra_meal_compute(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._extra_meal_slots(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_extra_meal_survey_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._extra_meal_compute(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_extra_meal_survey(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_extra_meal_survey(uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extra_meal_survey_report(uuid) TO authenticated;