CREATE OR REPLACE FUNCTION public.get_saldo_alumno(p_alumno_id uuid)
RETURNS TABLE(moneda text, total_cargos numeric, total_pagos numeric, saldo numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  WITH movimientos_corregidos AS (
    SELECT
      m.moneda,
      m.debe,
      CASE
        WHEN m.tipo = 'pago_suscripcion'
          AND m.haber = 0
          AND s.metodo_pago = 'mercadopago'
          AND s.mp_status = 'approved'
        THEN COALESCE(s.precio_final, s.precio_base, 0)
        ELSE m.haber
      END AS haber
    FROM public.vw_cuenta_corriente_movimientos m
    LEFT JOIN public.suscripciones s
      ON m.fuente_tabla = 'suscripciones'
     AND m.fuente_id = s.id
    WHERE m.alumno_id = p_alumno_id

    UNION ALL

    SELECT
      COALESCE(p.moneda, 'ARS') AS moneda,
      0::numeric AS debe,
      COALESCE(s.precio_final, s.precio_base, p.precio, 0)::numeric AS haber
    FROM public.suscripciones s
    LEFT JOIN public.planes p ON p.id = s.plan_id
    WHERE s.alumno_id = p_alumno_id
      AND s.cancelada_at IS NULL
      AND s.metodo_pago = 'mercadopago'
      AND s.mp_status = 'approved'
      AND s.origen_registro IN ('automatico', 'cargado_admin')
      AND s.estado IN ('activa', 'pendiente_verificacion', 'vencida', 'finalizada', 'conciliado')
      AND NOT EXISTS (
        SELECT 1
        FROM public.vw_cuenta_corriente_movimientos vm
        WHERE vm.fuente_tabla = 'suscripciones'
          AND vm.fuente_id = s.id
          AND vm.tipo = 'pago_suscripcion'
      )
  )
  SELECT
    mc.moneda,
    COALESCE(SUM(mc.debe), 0)::numeric AS total_cargos,
    COALESCE(SUM(mc.haber), 0)::numeric AS total_pagos,
    (COALESCE(SUM(mc.debe), 0) - COALESCE(SUM(mc.haber), 0))::numeric AS saldo
  FROM movimientos_corregidos mc
  GROUP BY mc.moneda
  ORDER BY mc.moneda;
END;
$function$;

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

  v_desde := COALESCE(h.fecha_vigencia, h.fecha_cambio::date);

  IF v_desde > CURRENT_DATE THEN
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
        AND s.estado IN ('activa', 'pendiente')
        AND s.fecha_inicio >= v_desde
        AND s.precio_base IS DISTINCT FROM h.precio_nuevo
        AND NOT (
          s.descuento_id IS NULL
          AND s.precio_excepcion_motivo IS NOT NULL
          AND btrim(s.precio_excepcion_motivo) <> ''
          AND s.precio_excepcion_tipo IS NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.apply_pending_price_changes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  RETURN total;
END;
$function$;