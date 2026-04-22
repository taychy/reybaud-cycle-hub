-- Función trigger que detecta cuando una suscripción "upgrade" se activa
-- y cancela la suscripción anterior, registrando el cambio en cambios_plan.
CREATE OR REPLACE FUNCTION public.handle_upgrade_subscription_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upgrade_meta jsonb;
  v_old_sub_id uuid;
  v_old_sub record;
  v_new_plan record;
BEGIN
  -- Solo procesar si la sub PASA a estar activa (no si ya estaba activa)
  IF NEW.estado <> 'activa' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = 'activa' THEN
    RETURN NEW;
  END IF;

  -- Buscar el marcador de upgrade en notas (formato: "UPGRADE_FROM:<uuid>")
  IF NEW.notas IS NULL OR NEW.notas NOT LIKE 'UPGRADE_FROM:%' THEN
    RETURN NEW;
  END IF;

  -- Extraer el id de la suscripción anterior
  BEGIN
    v_old_sub_id := substring(NEW.notas FROM 'UPGRADE_FROM:([0-9a-f-]+)')::uuid;
  EXCEPTION WHEN OTHERS THEN
    -- Marcador inválido, no hacer nada
    RETURN NEW;
  END;

  IF v_old_sub_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar la sub vieja
  SELECT * INTO v_old_sub
  FROM public.suscripciones
  WHERE id = v_old_sub_id
    AND alumno_id = NEW.alumno_id;

  IF v_old_sub IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cancelar la sub vieja si todavía no estaba cancelada
  IF v_old_sub.cancelada_at IS NULL THEN
    UPDATE public.suscripciones
    SET estado = 'cancelada',
        cancelada_at = now(),
        cancelada_motivo = 'Cambio de plan (upgrade pagado)',
        auto_renovacion = false,
        updated_at = now()
    WHERE id = v_old_sub_id;
  END IF;

  -- Buscar nombre del plan nuevo para el log
  SELECT * INTO v_new_plan FROM public.planes WHERE id = NEW.plan_id;

  -- Registrar el cambio
  INSERT INTO public.cambios_plan (
    alumno_id,
    suscripcion_anterior_id,
    suscripcion_nueva_id,
    plan_anterior_id,
    plan_nuevo_id,
    precio_anterior,
    precio_nuevo,
    dias_restantes,
    dias_totales,
    credito_calculado,
    costo_nuevo_prorrateado,
    diferencia,
    saldo_aplicado,
    notas
  ) VALUES (
    NEW.alumno_id,
    v_old_sub_id,
    NEW.id,
    v_old_sub.plan_id,
    NEW.plan_id,
    COALESCE(v_old_sub.precio_final, v_old_sub.precio_base, 0),
    COALESCE(NEW.precio_final, NEW.precio_base, 0),
    0, 0, 0, 0, 0, 0,
    'Cambio automático tras confirmación de pago. Plan: ' || COALESCE(v_new_plan.nombre, '—')
  );

  -- Limpiar el marcador del campo notas para no re-procesar
  UPDATE public.suscripciones
  SET notas = NULL
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_upgrade_activation ON public.suscripciones;

CREATE TRIGGER trg_handle_upgrade_activation
AFTER INSERT OR UPDATE OF estado ON public.suscripciones
FOR EACH ROW
EXECUTE FUNCTION public.handle_upgrade_subscription_activation();