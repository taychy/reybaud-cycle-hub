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

  -- mantenimiento interno disparado por otros triggers SECURITY DEFINER
  -- (auto-heal de subs vencidas, cierre de sub anterior, efectos de pausa)
  IF current_setting('app.sub_internal', true) = 'on' THEN
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

CREATE OR REPLACE FUNCTION public.check_duplicate_active_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid;
  v_existing_cat text;
  v_operational_states text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
  v_new_categoria text;
  v_prev text;
BEGIN
  IF NOT (NEW.estado = ANY(v_operational_states)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Auto-heal: cerrar subs 'activa' del mismo alumno cuya fecha_fin ya venció
  -- (excepto pausas). Se marca como mantenimiento interno para que el guard
  -- de alumnos no bloquee el UPDATE.
  IF NEW.alumno_id IS NOT NULL THEN
    v_prev := current_setting('app.sub_internal', true);
    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones s
    SET estado = 'vencida',
        updated_at = now()
    FROM public.planes p
    WHERE s.plan_id = p.id
      AND s.alumno_id = NEW.alumno_id
      AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.estado = 'activa'
      AND s.cancelada_at IS NULL
      AND s.fecha_fin IS NOT NULL
      AND s.fecha_fin < CURRENT_DATE
      AND COALESCE(p.categoria, '') <> 'pausa';
    PERFORM set_config('app.sub_internal', COALESCE(v_prev, ''), true);
  END IF;

  SELECT categoria INTO v_new_categoria FROM public.planes WHERE id = NEW.plan_id;

  IF v_new_categoria = 'asesoria' THEN
    RETURN NEW;
  END IF;

  IF v_new_categoria = 'pausa' THEN
    SELECT s.id INTO v_existing_id
    FROM public.suscripciones s
    WHERE s.alumno_id = NEW.alumno_id
      AND s.estado = ANY(v_operational_states)
      AND s.cancelada_at IS NULL
      AND s.id <> NEW.id
      AND (
        (s.fecha_inicio IS NULL OR NEW.fecha_fin    IS NULL OR s.fecha_inicio <= NEW.fecha_fin)
        AND
        (s.fecha_fin    IS NULL OR NEW.fecha_inicio IS NULL OR NEW.fecha_inicio <= s.fecha_fin)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_ACTIVE_SUB: El alumno tiene otra suscripción vigente. El Plan Reducido (pausa) no puede convivir con otros planes (sub existente: %)', v_existing_id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_new_categoria IN ('grupal','pista') THEN
    SELECT s.id, p.categoria INTO v_existing_id, v_existing_cat
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    WHERE s.alumno_id = NEW.alumno_id
      AND s.estado = ANY(v_operational_states)
      AND s.cancelada_at IS NULL
      AND s.id <> NEW.id
      AND (
        p.categoria = v_new_categoria
        OR p.categoria = 'pausa'
      )
      AND (
        (s.fecha_inicio IS NULL OR NEW.fecha_fin    IS NULL OR s.fecha_inicio <= NEW.fecha_fin)
        AND
        (s.fecha_fin    IS NULL OR NEW.fecha_inicio IS NULL OR NEW.fecha_inicio <= s.fecha_fin)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF v_existing_cat = 'pausa' THEN
        RAISE EXCEPTION 'BLOCKED_BY_ACTIVE_PAUSA: El alumno tiene una pausa activa (sub existente: %). Cancelala antes de contratar otro plan.', v_existing_id;
      ELSE
        RAISE EXCEPTION 'DUPLICATE_GRUPAL_CATEGORY: El alumno ya tiene otra suscripción % vigente (sub existente: %)', v_new_categoria, v_existing_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_previous_subscription_on_new()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_prev text;
BEGIN
  IF NEW.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado')
     AND NEW.cancelada_at IS NULL THEN
    v_prev := current_setting('app.sub_internal', true);
    PERFORM set_config('app.sub_internal', 'on', true);
    UPDATE public.suscripciones
    SET estado = CASE WHEN metodo_pago IS NOT NULL AND metodo_pago <> 'pendiente'
                        THEN 'finalizada' ELSE 'vencida' END,
        updated_at = now()
    WHERE alumno_id = NEW.alumno_id AND plan_id = NEW.plan_id AND id <> NEW.id
      AND estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado')
      AND cancelada_at IS NULL AND fecha_fin < CURRENT_DATE
      AND (NEW.fecha_inicio IS NULL OR fecha_fin < NEW.fecha_inicio);
    PERFORM set_config('app.sub_internal', COALESCE(v_prev, ''), true);
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.apply_pausa_side_effects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria text;
  v_operational text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
  v_prev text;
BEGIN
  IF NOT (NEW.estado = ANY(v_operational)) THEN
    RETURN NEW;
  END IF;
  IF NEW.cancelada_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT categoria INTO v_categoria FROM public.planes WHERE id = NEW.plan_id;
  IF v_categoria IS DISTINCT FROM 'pausa' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = NEW.estado AND OLD.fecha_fin = NEW.fecha_fin AND OLD.cancelada_at IS NOT DISTINCT FROM NEW.cancelada_at THEN
      RETURN NEW;
    END IF;
  END IF;

  v_prev := current_setting('app.sub_internal', true);
  PERFORM set_config('app.sub_internal', 'on', true);

  UPDATE public.suscripciones s
  SET cancelada_at = COALESCE(s.cancelada_at, now()),
      cancelada_motivo = COALESCE(s.cancelada_motivo, 'Pausa activada — acceso hasta fin de período'),
      auto_renovacion = false,
      updated_at = now()
  FROM public.planes p
  WHERE p.id = s.plan_id
    AND s.alumno_id = NEW.alumno_id
    AND s.id <> NEW.id
    AND s.estado = ANY(v_operational)
    AND s.cancelada_at IS NULL
    AND p.categoria IN ('grupal','pista','asesoria');

  PERFORM set_config('app.sub_internal', COALESCE(v_prev, ''), true);

  UPDATE public.alumnos
  SET estado = 'vacaciones',
      pause_fecha_estimada_retorno = COALESCE(NEW.fecha_fin, pause_fecha_estimada_retorno),
      pause_motivo = COALESCE(pause_motivo, 'Pausa solicitada — máx 2 meses'),
      updated_at = now()
  WHERE id = NEW.alumno_id;

  RETURN NEW;
END;
$function$;