
-- 1) Excepción de precio estructurada
ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS precio_excepcion_motivo text,
  ADD COLUMN IF NOT EXISTS precio_excepcion_autorizado_por uuid,
  ADD COLUMN IF NOT EXISTS precio_excepcion_at timestamptz;

-- 2) Validación: precio_final < precio_base requiere descuento o excepción autorizada
CREATE OR REPLACE FUNCTION public.validate_suscripcion_precio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.precio_base IS NOT NULL
     AND NEW.precio_final IS NOT NULL
     AND NEW.precio_final < NEW.precio_base - 0.01
     AND NEW.descuento_id IS NULL
     AND (NEW.precio_excepcion_motivo IS NULL OR btrim(NEW.precio_excepcion_motivo) = '')
  THEN
    IF current_setting('app.price_sync', true) = 'on' THEN
      -- sync de precios: normaliza en vez de fallar
      NEW.precio_final := NEW.precio_base;
    ELSE
      RAISE EXCEPTION 'El precio final (%) es menor al precio base (%) sin descuento ni excepción autorizada. Cargá un descuento o completá precio_excepcion_motivo.',
        NEW.precio_final, NEW.precio_base;
    END IF;
  END IF;

  IF NEW.precio_excepcion_motivo IS NOT NULL
     AND btrim(NEW.precio_excepcion_motivo) <> ''
     AND (TG_OP = 'INSERT' OR NEW.precio_excepcion_motivo IS DISTINCT FROM OLD.precio_excepcion_motivo
          OR NEW.precio_final IS DISTINCT FROM OLD.precio_final) THEN
    NEW.precio_excepcion_at := COALESCE(NEW.precio_excepcion_at, now());
    NEW.precio_excepcion_autorizado_por := COALESCE(NEW.precio_excepcion_autorizado_por, auth.uid());

    INSERT INTO public.audit_log (tabla, registro_id, accion, detalle, usuario_id)
    VALUES (
      'suscripciones', NEW.id, 'precio_excepcion',
      jsonb_build_object(
        'precio_base', NEW.precio_base,
        'precio_final', NEW.precio_final,
        'motivo', NEW.precio_excepcion_motivo,
        'autorizado_por', NEW.precio_excepcion_autorizado_por
      ),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_suscripcion_precio ON public.suscripciones;
CREATE TRIGGER trg_validate_suscripcion_precio
BEFORE INSERT OR UPDATE OF precio_base, precio_final, descuento_id, precio_excepcion_motivo
ON public.suscripciones
FOR EACH ROW EXECUTE FUNCTION public.validate_suscripcion_precio();

-- 3) Fin de la propagación de ratios no documentados
CREATE OR REPLACE FUNCTION public.apply_price_change_to_subscriptions(_historial_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  v_desde := GREATEST(COALESCE(h.fecha_vigencia, h.fecha_cambio::date), h.fecha_cambio::date);

  PERFORM set_config('app.price_sync', 'on', true);

  WITH upd AS (
    UPDATE public.suscripciones s
    SET precio_base = h.precio_nuevo,
        precio_final = CASE
          -- Sin descuento ni excepción documentada: precio nuevo completo
          WHEN s.descuento_id IS NULL
               AND (s.precio_excepcion_motivo IS NULL OR btrim(s.precio_excepcion_motivo) = '')
            THEN h.precio_nuevo
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
$function$;

-- 4) Reporte de afectados (sin corregir nada)
CREATE OR REPLACE FUNCTION public.report_precio_final_sin_respaldo()
RETURNS TABLE (
  suscripcion_id uuid,
  alumno_id uuid,
  alumno_nombre text,
  plan_id uuid,
  plan_nombre text,
  fecha_inicio date,
  fecha_fin date,
  estado text,
  precio_base numeric,
  precio_final numeric,
  diferencia numeric,
  clasificacion text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.alumno_id, a.nombre, s.plan_id, p.nombre,
    s.fecha_inicio, s.fecha_fin, s.estado,
    s.precio_base, s.precio_final,
    ROUND(s.precio_base - s.precio_final, 2),
    CASE
      WHEN EXISTS (SELECT 1 FROM public.facturas f
                   WHERE f.referencia_tipo = 'suscripcion' AND f.referencia_id = s.id
                     AND f.estado = 'emitida') THEN 'facturado'
      WHEN s.mp_payment_id IS NOT NULL OR s.estado IN ('activa','finalizada','conciliado') THEN 'pagado'
      WHEN s.fecha_inicio > CURRENT_DATE THEN 'futuro'
      ELSE 'pendiente'
    END
  FROM public.suscripciones s
  LEFT JOIN public.alumnos a ON a.id = s.alumno_id
  LEFT JOIN public.planes p ON p.id = s.plan_id
  WHERE s.precio_base IS NOT NULL AND s.precio_final IS NOT NULL
    AND s.precio_final < s.precio_base - 0.01
    AND s.descuento_id IS NULL
    AND (s.precio_excepcion_motivo IS NULL OR btrim(s.precio_excepcion_motivo) = '')
  ORDER BY s.fecha_inicio DESC;
$$;

GRANT EXECUTE ON FUNCTION public.report_precio_final_sin_respaldo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_precio_final_sin_respaldo() TO service_role;
