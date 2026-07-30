
CREATE OR REPLACE FUNCTION public.guard_suscripcion_student_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- proceso interno de actualización de precios
  IF current_setting('app.price_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.estado            IS DISTINCT FROM OLD.estado            OR
     NEW.precio_base       IS DISTINCT FROM OLD.precio_base       OR
     NEW.precio_final      IS DISTINCT FROM OLD.precio_final      OR
     NEW.descuento_id      IS DISTINCT FROM OLD.descuento_id      OR
     NEW.plan_id           IS DISTINCT FROM OLD.plan_id           OR
     NEW.alumno_id         IS DISTINCT FROM OLD.alumno_id         OR
     NEW.fecha_inicio      IS DISTINCT FROM OLD.fecha_inicio      OR
     NEW.fecha_fin         IS DISTINCT FROM OLD.fecha_fin         OR
     COALESCE(NEW.auto_cobro_activo,false) IS DISTINCT FROM COALESCE(OLD.auto_cobro_activo,false) OR
     COALESCE(NEW.chequeado_admin,false)   IS DISTINCT FROM COALESCE(OLD.chequeado_admin,false)   OR
     COALESCE(NEW.baja_chequeada,false)    IS DISTINCT FROM COALESCE(OLD.baja_chequeada,false)
  THEN
    RAISE EXCEPTION 'No autorizado para modificar campos restringidos de la suscripción';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_price_change_to_subscriptions(
  _historial_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
  v_desde date;
  v_count integer := 0;
BEGIN
  SELECT * INTO h FROM public.precio_historial WHERE id = _historial_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cambio de precio inexistente';
  END IF;

  IF h.aplicar_a IS DISTINCT FROM 'todos' THEN
    RETURN 0;
  END IF;

  v_desde := COALESCE(h.fecha_vigencia, h.fecha_cambio::date);
  IF v_desde > CURRENT_DATE THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.price_sync', 'on', true);

  WITH upd AS (
    UPDATE public.suscripciones s
    SET precio_base = h.precio_nuevo,
        precio_final = CASE
          WHEN s.precio_base IS NULL OR s.precio_base <= 0 THEN h.precio_nuevo
          ELSE ROUND(h.precio_nuevo * (COALESCE(s.precio_final, s.precio_base) / s.precio_base))
        END,
        updated_at = now()
    WHERE s.plan_id = h.plan_id
      AND s.estado IN ('activa', 'pendiente')
      AND s.fecha_inicio >= v_desde
      AND s.precio_base IS DISTINCT FROM h.precio_nuevo
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  PERFORM set_config('app.price_sync', 'off', true);

  UPDATE public.precio_historial
  SET aplicado_at = now(),
      suscripciones_actualizadas = v_count
  WHERE id = _historial_id;

  RETURN v_count;
END;
$$;
