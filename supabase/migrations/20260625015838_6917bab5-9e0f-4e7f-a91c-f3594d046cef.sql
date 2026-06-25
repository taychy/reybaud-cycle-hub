CREATE OR REPLACE FUNCTION public.sync_segunda_actividad_discount(_alumno_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_descuento_id uuid;
  v_existing uuid;
BEGIN
  IF _alumno_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_descuento_id
  FROM public.descuentos
  WHERE categoria = 'segunda_actividad' AND activo = true
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_descuento_id IS NULL THEN RETURN; END IF;

  -- Contar suscripciones que están REALMENTE solapadas hoy
  -- (no contamos renovaciones futuras del mismo plan que aún no empezaron)
  SELECT COUNT(*) INTO v_count
  FROM public.suscripciones s
  LEFT JOIN public.planes p ON p.id = s.plan_id
  WHERE s.alumno_id = _alumno_id
    AND s.estado IN ('activa','pendiente_verificacion','pago_pendiente','acceso_pausado')
    AND s.cancelada_at IS NULL
    AND (s.fecha_inicio IS NULL OR s.fecha_inicio <= CURRENT_DATE)
    AND (s.fecha_fin IS NULL OR s.fecha_fin >= CURRENT_DATE)
    AND COALESCE(p.categoria,'otro') <> 'pausa';

  SELECT id INTO v_existing
  FROM public.descuentos_alumno
  WHERE alumno_id = _alumno_id AND descuento_id = v_descuento_id
  LIMIT 1;

  IF v_count >= 2 THEN
    IF v_existing IS NULL THEN
      INSERT INTO public.descuentos_alumno (alumno_id, descuento_id, activo)
      VALUES (_alumno_id, v_descuento_id, true);
    ELSE
      UPDATE public.descuentos_alumno SET activo = true WHERE id = v_existing AND activo = false;
    END IF;
  ELSE
    IF v_existing IS NOT NULL THEN
      UPDATE public.descuentos_alumno SET activo = false WHERE id = v_existing AND activo = true;
    END IF;
  END IF;
END;
$function$;

-- Re-sincronizar a todos los alumnos con el criterio corregido
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT alumno_id FROM public.suscripciones WHERE alumno_id IS NOT NULL LOOP
    PERFORM public.sync_segunda_actividad_discount(r.alumno_id);
  END LOOP;
END $$;