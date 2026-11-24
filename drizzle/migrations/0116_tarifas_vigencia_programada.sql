ALTER TABLE public.precio_historial ADD COLUMN IF NOT EXISTS programado boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.servicio_turnera_precio_programado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios_turnera(id),
  precio_anterior numeric NOT NULL,
  precio_nuevo numeric NOT NULL,
  fecha_vigencia date NOT NULL,
  aplicado_at timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (servicio_id, fecha_vigencia)
);
GRANT SELECT ON public.servicio_turnera_precio_programado TO authenticated;
GRANT ALL ON public.servicio_turnera_precio_programado TO service_role;
ALTER TABLE public.servicio_turnera_precio_programado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins leen tarifas turnera programadas" ON public.servicio_turnera_precio_programado
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Precio de lista vigente para una fecha de servicio (solo lectura).
CREATE OR REPLACE FUNCTION public.tarifa_vigente_plan(_plan_id uuid, _fecha date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN _fecha >= h.fecha_vigencia THEN h.precio_nuevo ELSE h.precio_anterior END
       FROM public.precio_historial h
      WHERE h.plan_id = _plan_id AND h.programado
        AND _fecha >= h.fecha_vigencia - 62
      ORDER BY (_fecha >= h.fecha_vigencia) DESC,
               CASE WHEN _fecha >= h.fecha_vigencia THEN h.fecha_vigencia END DESC NULLS LAST,
               h.fecha_vigencia ASC
      LIMIT 1),
    (SELECT precio FROM public.planes WHERE id = _plan_id));
$$;

CREATE OR REPLACE FUNCTION public.tarifa_vigente_servicio_turnera(_servicio_id uuid, _fecha date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN _fecha >= p.fecha_vigencia THEN p.precio_nuevo ELSE p.precio_anterior END
       FROM public.servicio_turnera_precio_programado p
      WHERE p.servicio_id = _servicio_id AND _fecha >= p.fecha_vigencia - 62
      ORDER BY (_fecha >= p.fecha_vigencia) DESC,
               CASE WHEN _fecha >= p.fecha_vigencia THEN p.fecha_vigencia END DESC NULLS LAST,
               p.fecha_vigencia ASC
      LIMIT 1),
    (SELECT precio FROM public.servicios_turnera WHERE id = _servicio_id));
$$;
GRANT EXECUTE ON FUNCTION public.tarifa_vigente_plan(uuid, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tarifa_vigente_servicio_turnera(uuid, date) TO anon, authenticated, service_role;

-- Nuevas suscripciones: si el precio de lista recibido es la otra tarifa del
-- cambio programado, se reemplaza por la vigente para fecha_inicio.
CREATE OR REPLACE FUNCTION public.aplicar_tarifa_vigente_suscripcion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h record; v_obj numeric; v_otro numeric; v_old_base numeric; v_old_final numeric; d record;
BEGIN
  IF NEW.plan_id IS NULL OR NEW.fecha_inicio IS NULL OR NEW.precio_base IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO h FROM public.precio_historial
   WHERE plan_id = NEW.plan_id AND programado
     AND NEW.fecha_inicio >= fecha_vigencia - 62
   ORDER BY abs(NEW.fecha_inicio - fecha_vigencia) LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_obj  := CASE WHEN NEW.fecha_inicio >= h.fecha_vigencia THEN h.precio_nuevo ELSE h.precio_anterior END;
  v_otro := CASE WHEN NEW.fecha_inicio >= h.fecha_vigencia THEN h.precio_anterior ELSE h.precio_nuevo END;
  IF abs(NEW.precio_base - v_otro) > 0.01 THEN RETURN NEW; END IF;

  v_old_base := NEW.precio_base; v_old_final := NEW.precio_final;
  NEW.precio_base := v_obj;
  IF NEW.descuento_id IS NOT NULL THEN
    SELECT tipo, valor INTO d FROM public.descuentos WHERE id = NEW.descuento_id;
    IF d.tipo = 'fijo' THEN NEW.precio_final := GREATEST(0, v_obj - d.valor);
    ELSIF d.valor IS NOT NULL THEN NEW.precio_final := round(v_obj * (1 - d.valor / 100.0)); END IF;
  ELSIF NEW.precio_final IS NULL OR abs(NEW.precio_final - v_old_base) <= 0.01 THEN
    NEW.precio_final := v_obj;
  ELSIF NEW.precio_excepcion_tipo = 'porcentaje' AND NEW.precio_excepcion_valor IS NOT NULL THEN
    NEW.precio_final := round(v_obj * (1 - NEW.precio_excepcion_valor / 100.0));
  END IF;  -- otros importes manuales se conservan tal cual

  INSERT INTO public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'system', 'tarifa_por_fecha_servicio', 'suscripciones', NEW.id::text,
    jsonb_build_object('plan_id', NEW.plan_id, 'fecha_inicio', NEW.fecha_inicio,
      'fecha_vigencia', h.fecha_vigencia, 'precio_base_recibido', v_old_base,
      'precio_final_recibido', v_old_final, 'precio_base', NEW.precio_base, 'precio_final', NEW.precio_final));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_a_tarifa_vigente_suscripcion ON public.suscripciones;
CREATE TRIGGER trg_a_tarifa_vigente_suscripcion BEFORE INSERT ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_tarifa_vigente_suscripcion();

CREATE OR REPLACE FUNCTION public.aplicar_tarifa_vigente_turnera()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; v_obj numeric; v_otro numeric; v_old numeric;
BEGIN
  IF NEW.servicio_id IS NULL OR NEW.fecha IS NULL OR NEW.precio_snapshot IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.servicio_turnera_precio_programado
   WHERE servicio_id = NEW.servicio_id AND NEW.fecha >= fecha_vigencia - 62
   ORDER BY abs(NEW.fecha - fecha_vigencia) LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_obj  := CASE WHEN NEW.fecha >= p.fecha_vigencia THEN p.precio_nuevo ELSE p.precio_anterior END;
  v_otro := CASE WHEN NEW.fecha >= p.fecha_vigencia THEN p.precio_anterior ELSE p.precio_nuevo END;
  IF abs(NEW.precio_snapshot - v_otro) > 0.01 THEN RETURN NEW; END IF;
  v_old := NEW.precio_snapshot;
  NEW.precio_snapshot := v_obj;
  INSERT INTO public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'system', 'tarifa_por_fecha_servicio', 'reservas_turnera', NEW.id::text,
    jsonb_build_object('servicio_id', NEW.servicio_id, 'fecha', NEW.fecha,
      'fecha_vigencia', p.fecha_vigencia, 'precio_recibido', v_old, 'precio_snapshot', v_obj));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_a_tarifa_vigente_turnera ON public.reservas_turnera;
CREATE TRIGGER trg_a_tarifa_vigente_turnera BEFORE INSERT ON public.reservas_turnera
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_tarifa_vigente_turnera();

-- El job diario existente (03:15 ART) también aplica las tarifas de turnera.
CREATE OR REPLACE FUNCTION public.apply_pending_price_changes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  r RECORD;
  total integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM public.precio_historial
    WHERE aplicado_at IS NULL
      AND COALESCE(fecha_vigencia, fecha_cambio::date) <= CURRENT_DATE
      AND fecha_cambio >= now() - interval '180 days'
    ORDER BY COALESCE(fecha_vigencia, fecha_cambio::date), fecha_cambio
  LOOP
    total := total + public.apply_price_change_to_subscriptions(r.id);
  END LOOP;

  FOR r IN
    SELECT id, servicio_id, precio_nuevo FROM public.servicio_turnera_precio_programado
    WHERE aplicado_at IS NULL AND fecha_vigencia <= CURRENT_DATE
    ORDER BY fecha_vigencia
    FOR UPDATE
  LOOP
    UPDATE public.servicios_turnera SET precio = r.precio_nuevo, updated_at = now()
     WHERE id = r.servicio_id AND precio IS DISTINCT FROM r.precio_nuevo;
    UPDATE public.servicio_turnera_precio_programado SET aplicado_at = now() WHERE id = r.id;
  END LOOP;
  RETURN total;
END;
$function$;

-- Prueba aislada: todo se revierte; devuelve el resultado de cada caso.
CREATE OR REPLACE FUNCTION public.run_tarifas_vigencia_tests(_alumno_id uuid, _plan_id uuid, _descuento_id uuid, _servicio_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb := '{}'; h record; p record; v_id uuid; r record;
BEGIN
  BEGIN
    SELECT * INTO h FROM public.precio_historial WHERE plan_id=_plan_id AND programado ORDER BY fecha_vigencia DESC LIMIT 1;
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia - 30,h.fecha_vigencia - 1,h.precio_anterior,h.precio_anterior,'test') RETURNING id INTO v_id;
    SELECT precio_base,precio_final INTO r FROM public.suscripciones WHERE id=v_id;
    res := res || jsonb_build_object('nov_conserva', r.precio_base = h.precio_anterior);
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia - 30,h.fecha_vigencia - 1,h.precio_nuevo,h.precio_nuevo,'test') RETURNING id INTO v_id;
    SELECT precio_base INTO r FROM public.suscripciones WHERE id=v_id;
    res := res || jsonb_build_object('nov_tardia_vuelve_anterior', r.precio_base = h.precio_anterior);
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia,h.fecha_vigencia + 30,h.precio_anterior,h.precio_anterior,'test') RETURNING id INTO v_id;
    SELECT precio_base,precio_final INTO r FROM public.suscripciones WHERE id=v_id;
    res := res || jsonb_build_object('dic_anticipada_nueva', r.precio_base = h.precio_nuevo AND r.precio_final = h.precio_nuevo);
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,descuento_id,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia,h.fecha_vigencia + 30,h.precio_anterior,0,_descuento_id,'test') RETURNING id INTO v_id;
    SELECT s.precio_base,s.precio_final,d.valor INTO r FROM public.suscripciones s JOIN public.descuentos d ON d.id=s.descuento_id WHERE s.id=v_id;
    res := res || jsonb_build_object('dic_descuento_recalculado', r.precio_final = round(h.precio_nuevo*(1-r.valor/100.0)), 'dic_descuento_final', r.precio_final);
    SELECT * INTO p FROM public.servicio_turnera_precio_programado WHERE servicio_id=_servicio_id LIMIT 1;
    IF FOUND THEN
      res := res || jsonb_build_object(
        'turnera_nov', public.tarifa_vigente_servicio_turnera(_servicio_id, p.fecha_vigencia - 1) = p.precio_anterior,
        'turnera_dic', public.tarifa_vigente_servicio_turnera(_servicio_id, p.fecha_vigencia) = p.precio_nuevo);
    END IF;
    res := res || jsonb_build_object('catalogo_nov', public.tarifa_vigente_plan(_plan_id, h.fecha_vigencia - 1) = h.precio_anterior,
                                     'catalogo_dic', public.tarifa_vigente_plan(_plan_id, h.fecha_vigencia) = h.precio_nuevo);
    RAISE EXCEPTION 'rollback_test';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'rollback_test' THEN RAISE; END IF;
  END;
  RETURN res;
END; $$;
REVOKE ALL ON FUNCTION public.run_tarifas_vigencia_tests(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;