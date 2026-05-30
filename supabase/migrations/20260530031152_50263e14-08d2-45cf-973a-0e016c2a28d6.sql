-- ============================================================
-- PAUSA UNIFICADA: exclusividad + activación automática + límite 60 días
-- ============================================================

-- 1) Extender el trigger de conflicto de categoría:
--    Antes: solo bloqueaba grupal vs grupal.
--    Ahora: pausa es excluyente con grupal/pista/asesoria/pausa.
--           También seguimos bloqueando grupal vs grupal.

CREATE OR REPLACE FUNCTION public.check_grupal_category_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria text;
  v_existing record;
  v_conflict_cats text[];
  v_operational text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
BEGIN
  IF NOT (NEW.estado = ANY(v_operational)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado AND OLD.plan_id = NEW.plan_id THEN
    RETURN NEW;
  END IF;

  SELECT categoria INTO v_categoria FROM public.planes WHERE id = NEW.plan_id;

  -- Decidir qué categorías son incompatibles con esta nueva sub
  IF v_categoria = 'grupal' THEN
    -- Grupal: incompatible con otro grupal y con pausa
    v_conflict_cats := ARRAY['grupal','pausa'];
  ELSIF v_categoria = 'pausa' THEN
    -- Pausa: incompatible con CUALQUIER otra sub deportiva (grupal/pista/asesoria) y con otra pausa
    v_conflict_cats := ARRAY['grupal','pista','asesoria','pausa'];
  ELSIF v_categoria IN ('pista','asesoria') THEN
    -- Pista/Asesoría: solo bloquean conflicto con pausa (entre sí son compatibles)
    v_conflict_cats := ARRAY['pausa'];
  ELSE
    RETURN NEW;
  END IF;

  SELECT s.id, p.nombre, p.categoria INTO v_existing
  FROM public.suscripciones s
  JOIN public.planes p ON p.id = s.plan_id
  WHERE s.alumno_id = NEW.alumno_id
    AND s.id <> NEW.id
    AND s.estado = ANY(v_operational)
    AND s.cancelada_at IS NULL
    AND p.categoria = ANY(v_conflict_cats)
    AND (
      NEW.fecha_fin IS NULL OR s.fecha_fin IS NULL
      OR (s.fecha_inicio <= NEW.fecha_fin AND s.fecha_fin >= NEW.fecha_inicio)
    )
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF v_categoria = 'pausa' THEN
      RAISE EXCEPTION 'PAUSA_BLOCKED_BY_ACTIVE_SUB: El alumno tiene un plan activo (%) que debe cancelarse para activar la pausa.', v_existing.nombre;
    ELSIF v_existing.categoria = 'pausa' THEN
      RAISE EXCEPTION 'BLOCKED_BY_ACTIVE_PAUSA: El alumno está en pausa. Hay que cancelar la pausa para activar otro plan.';
    ELSE
      RAISE EXCEPTION 'DUPLICATE_GRUPAL_CATEGORY: El alumno ya tiene un plan grupal activo (%) en este período. Solo puede tener un plan grupal a la vez.', v_existing.nombre;
    END IF;
  END IF;

  -- 2) Tope duro de duración para PAUSA: máx 62 días (~2 meses)
  IF v_categoria = 'pausa' AND NEW.fecha_inicio IS NOT NULL AND NEW.fecha_fin IS NOT NULL THEN
    IF (NEW.fecha_fin - NEW.fecha_inicio) > 62 THEN
      RAISE EXCEPTION 'PAUSA_TOO_LONG: La pausa no puede durar más de 2 meses (62 días).';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 3) Trigger: cuando se activa/crea una sub de PAUSA →
--    - cancela las otras subs operativas (manteniendo acceso hasta su fecha_fin)
--    - pone al alumno en estado 'vacaciones'
--    - copia fecha_fin a alumnos.pause_fecha_estimada_retorno
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_pausa_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria text;
  v_operational text[] := ARRAY['activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado'];
BEGIN
  -- Solo procesar si la sub es operativa
  IF NOT (NEW.estado = ANY(v_operational)) THEN
    RETURN NEW;
  END IF;
  IF NEW.cancelada_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Solo si es categoría pausa
  SELECT categoria INTO v_categoria FROM public.planes WHERE id = NEW.plan_id;
  IF v_categoria IS DISTINCT FROM 'pausa' THEN
    RETURN NEW;
  END IF;

  -- En UPDATE solo procesamos si pasó a operativa o si era ya operativa y cambió fecha_fin
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = NEW.estado AND OLD.fecha_fin = NEW.fecha_fin AND OLD.cancelada_at IS NOT DISTINCT FROM NEW.cancelada_at THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Cancelar otras subs operativas del alumno (grupal/pista/asesoria),
  -- manteniendo acceso hasta su fecha_fin (política de cancellation grace)
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

  -- Marcar al alumno en vacaciones y guardar fecha de regreso estimada
  UPDATE public.alumnos
  SET estado = 'vacaciones',
      pause_fecha_estimada_retorno = COALESCE(NEW.fecha_fin, pause_fecha_estimada_retorno),
      pause_motivo = COALESCE(pause_motivo, 'Pausa solicitada — máx 2 meses'),
      updated_at = now()
  WHERE id = NEW.alumno_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_pausa_side_effects ON public.suscripciones;
CREATE TRIGGER trg_apply_pausa_side_effects
AFTER INSERT OR UPDATE ON public.suscripciones
FOR EACH ROW
EXECUTE FUNCTION public.apply_pausa_side_effects();

-- ============================================================
-- 4) Función helper para expirar pausas vencidas (la llama el cron / edge function)
--    - cancela la sub de pausa
--    - vuelve al alumno a 'inactivo'
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_overdue_pausas()
RETURNS TABLE(suscripcion_id uuid, alumno_id uuid, alumno_email text, alumno_nombre text, fecha_fin date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH expired AS (
    SELECT s.id AS sub_id, s.alumno_id, s.fecha_fin
    FROM public.suscripciones s
    JOIN public.planes p ON p.id = s.plan_id
    WHERE p.categoria = 'pausa'
      AND s.cancelada_at IS NULL
      AND s.estado IN ('activa','pendiente','pendiente_verificacion','pago_pendiente','acceso_pausado')
      AND s.fecha_fin < CURRENT_DATE
  ),
  upd_sub AS (
    UPDATE public.suscripciones s
    SET estado = 'vencida',
        cancelada_at = now(),
        cancelada_motivo = 'Pausa vencida (>2 meses sin reactivación)',
        auto_renovacion = false,
        updated_at = now()
    FROM expired e
    WHERE s.id = e.sub_id
    RETURNING s.id, s.alumno_id, s.fecha_fin
  ),
  upd_alu AS (
    UPDATE public.alumnos a
    SET estado = 'inactivo',
        pause_fecha_estimada_retorno = NULL,
        pause_motivo = NULL,
        updated_at = now()
    FROM upd_sub
    WHERE a.id = upd_sub.alumno_id
      AND a.estado = 'vacaciones'
    RETURNING a.id, a.email, a.nombre
  )
  SELECT us.id, us.alumno_id, ua.email, ua.nombre, us.fecha_fin
  FROM upd_sub us
  LEFT JOIN upd_alu ua ON ua.id = us.alumno_id;
END;
$function$;