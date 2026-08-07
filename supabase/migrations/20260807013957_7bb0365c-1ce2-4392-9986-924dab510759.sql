CREATE OR REPLACE FUNCTION public.apply_price_change_to_subscriptions(_historial_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  h RECORD;
  v_desde date;
  v_last_applied date;
  v_count integer := 0;
BEGIN
  SELECT * INTO h FROM public.precio_historial WHERE id = _historial_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cambio de precio inexistente';
  END IF;

  v_desde := COALESCE(h.fecha_vigencia, h.fecha_cambio::date);

  IF v_desde > CURRENT_DATE THEN
    RETURN 0;
  END IF;

  SELECT MAX(COALESCE(ph.fecha_vigencia, ph.fecha_cambio::date))
    INTO v_last_applied
  FROM public.precio_historial ph
  WHERE ph.plan_id = h.plan_id
    AND ph.id <> h.id
    AND ph.aplicado_at IS NOT NULL;

  IF v_last_applied IS NOT NULL AND v_desde < v_last_applied THEN
    UPDATE public.precio_historial
    SET aplicado_at = now(),
        suscripciones_actualizadas = 0
    WHERE id = _historial_id;
    RETURN 0;
  END IF;

  UPDATE public.planes
  SET precio = h.precio_nuevo,
      updated_at = now()
  WHERE id = h.plan_id
    AND precio IS DISTINCT FROM h.precio_nuevo;

  IF h.aplicar_a = 'todos' THEN
    PERFORM set_config('app.price_sync', 'on', true);

    WITH upd AS (
      UPDATE public.suscripciones s
      SET precio_base = h.precio_nuevo,
          precio_final = CASE
            WHEN s.descuento_id IS NOT NULL THEN (
              SELECT CASE
                WHEN d.tipo = 'fijo' THEN GREATEST(0, h.precio_nuevo - d.valor)
                ELSE ROUND(h.precio_nuevo * (1 - d.valor / 100.0), 2)
              END
              FROM public.descuentos d WHERE d.id = s.descuento_id
            )
            WHEN s.precio_excepcion_tipo = 'porcentaje' AND s.precio_excepcion_valor IS NOT NULL
              THEN ROUND(h.precio_nuevo * (1 - s.precio_excepcion_valor / 100.0), 2)
            WHEN s.precio_excepcion_tipo = 'monto_fijo' AND s.precio_excepcion_valor IS NOT NULL
              THEN GREATEST(0, h.precio_nuevo - s.precio_excepcion_valor)
            WHEN s.precio_excepcion_tipo = 'precio_fijo'
                 AND (s.precio_excepcion_vigencia_hasta IS NULL OR s.precio_excepcion_vigencia_hasta >= v_desde)
              THEN COALESCE(s.precio_excepcion_valor, s.precio_final, h.precio_nuevo)
            ELSE h.precio_nuevo
          END,
          updated_at = now()
      WHERE s.plan_id = h.plan_id
        AND s.estado IN ('activa', 'pendiente', 'pendiente_pago', 'pendiente_verificacion')
        AND s.fecha_inicio >= v_desde
        AND s.precio_base IS DISTINCT FROM h.precio_nuevo
        AND NOT (
          s.descuento_id IS NULL
          AND s.precio_excepcion_motivo IS NOT NULL
          AND btrim(s.precio_excepcion_motivo) <> ''
          AND s.precio_excepcion_tipo IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.precio_historial ph2
          WHERE ph2.plan_id = h.plan_id
            AND ph2.id <> h.id
            AND ph2.aplicado_at IS NOT NULL
            AND COALESCE(ph2.fecha_vigencia, ph2.fecha_cambio::date) > v_desde
            AND COALESCE(ph2.fecha_vigencia, ph2.fecha_cambio::date) <= CURRENT_DATE
            AND s.precio_base = ph2.precio_nuevo
        )
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM upd;

    PERFORM set_config('app.price_sync', 'off', true);
  END IF;

  UPDATE public.precio_historial
  SET aplicado_at = now(),
      suscripciones_actualizadas = v_count
  WHERE id = _historial_id;

  RETURN v_count;
END;
$fn$;

-- Registrar en historial las ediciones manuales del precio del plan
CREATE OR REPLACE FUNCTION public.log_plan_precio_manual_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.precio IS DISTINCT FROM OLD.precio
     AND COALESCE(current_setting('app.price_sync', true), 'off') <> 'on' THEN
    INSERT INTO public.precio_historial (
      plan_id, precio_anterior, precio_nuevo, fecha_vigencia,
      aplicar_a, aplicado_at, suscripciones_actualizadas, notas, modificado_por
    ) VALUES (
      NEW.id, OLD.precio, NEW.precio, CURRENT_DATE,
      'nuevos', now(), 0,
      'Edición manual del precio del plan (registro automático)', auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_plan_precio_manual_change ON public.planes;
CREATE TRIGGER trg_log_plan_precio_manual_change
AFTER UPDATE OF precio ON public.planes
FOR EACH ROW EXECUTE FUNCTION public.log_plan_precio_manual_change();