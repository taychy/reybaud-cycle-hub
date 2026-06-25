
-- 1) Restringir el descuento "segunda_actividad" al rubro Planes
UPDATE public.descuentos
SET aplica_a = 'planes'
WHERE categoria = 'segunda_actividad';

-- 2) Validar a futuro: segunda_actividad SIEMPRE aplica_a='planes'
CREATE OR REPLACE FUNCTION public.validate_segunda_actividad_aplica_a()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.categoria = 'segunda_actividad' AND NEW.aplica_a IS DISTINCT FROM 'planes' THEN
    RAISE EXCEPTION 'Los descuentos de segunda actividad sólo pueden aplicar a Planes (aplica_a=planes)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_segunda_actividad_aplica_a ON public.descuentos;
CREATE TRIGGER trg_validate_segunda_actividad_aplica_a
BEFORE INSERT OR UPDATE ON public.descuentos
FOR EACH ROW EXECUTE FUNCTION public.validate_segunda_actividad_aplica_a();

-- 3) Auto-asignar / auto-desasignar descuento de segunda actividad
-- Regla: alumno tiene >=2 suscripciones vigentes de modalidad NO pausa => activar.
-- En caso contrario => desactivar (no eliminar, para preservar historial).
CREATE OR REPLACE FUNCTION public.sync_segunda_actividad_discount(_alumno_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT COUNT(*) INTO v_count
  FROM public.suscripciones s
  LEFT JOIN public.planes p ON p.id = s.plan_id
  WHERE s.alumno_id = _alumno_id
    AND s.estado IN ('activa','pendiente_verificacion','pago_pendiente','acceso_pausado')
    AND s.cancelada_at IS NULL
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
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_segunda_actividad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_segunda_actividad_discount(OLD.alumno_id);
    RETURN OLD;
  ELSE
    PERFORM public.sync_segunda_actividad_discount(NEW.alumno_id);
    IF TG_OP = 'UPDATE' AND OLD.alumno_id IS DISTINCT FROM NEW.alumno_id THEN
      PERFORM public.sync_segunda_actividad_discount(OLD.alumno_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_suscripciones_segunda_actividad ON public.suscripciones;
CREATE TRIGGER trg_suscripciones_segunda_actividad
AFTER INSERT OR UPDATE OR DELETE ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_segunda_actividad();

-- 4) Backfill: recalcular para todos los alumnos con suscripciones existentes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT alumno_id FROM public.suscripciones WHERE alumno_id IS NOT NULL LOOP
    PERFORM public.sync_segunda_actividad_discount(r.alumno_id);
  END LOOP;
END $$;
