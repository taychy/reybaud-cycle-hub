CREATE OR REPLACE FUNCTION public.run_tarifas_vigencia_tests(_alumno_id uuid, _plan_id uuid, _descuento_id uuid, _servicio_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb := '{}'; h record; p record; v_id uuid; r record;
BEGIN
  BEGIN
    SELECT * INTO h FROM public.precio_historial WHERE plan_id=_plan_id AND programado ORDER BY fecha_vigencia DESC LIMIT 1;
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia - 30,h.fecha_vigencia - 1,h.precio_anterior,h.precio_anterior,'test') RETURNING id INTO v_id;
    SELECT precio_base,precio_final INTO r FROM public.suscripciones WHERE id=v_id;
    DELETE FROM public.suscripciones WHERE id=v_id;
    res := res || jsonb_build_object('nov_conserva', r.precio_base = h.precio_anterior);
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia - 30,h.fecha_vigencia - 1,h.precio_nuevo,h.precio_nuevo,'test') RETURNING id INTO v_id;
    SELECT precio_base INTO r FROM public.suscripciones WHERE id=v_id;
    DELETE FROM public.suscripciones WHERE id=v_id;
    res := res || jsonb_build_object('nov_tardia_vuelve_anterior', r.precio_base = h.precio_anterior);
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia,h.fecha_vigencia + 30,h.precio_anterior,h.precio_anterior,'test') RETURNING id INTO v_id;
    SELECT precio_base,precio_final INTO r FROM public.suscripciones WHERE id=v_id;
    DELETE FROM public.suscripciones WHERE id=v_id;
    res := res || jsonb_build_object('dic_anticipada_nueva', r.precio_base = h.precio_nuevo AND r.precio_final = h.precio_nuevo);
    INSERT INTO public.suscripciones(alumno_id,plan_id,estado,fecha_inicio,fecha_fin,precio_base,precio_final,descuento_id,origen_registro)
      VALUES (_alumno_id,_plan_id,'pendiente',h.fecha_vigencia,h.fecha_vigencia + 30,h.precio_anterior,0,_descuento_id,'test') RETURNING id INTO v_id;
    SELECT s.precio_base,s.precio_final,d.valor INTO r FROM public.suscripciones s JOIN public.descuentos d ON d.id=s.descuento_id WHERE s.id=v_id;
    DELETE FROM public.suscripciones WHERE id=v_id;
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