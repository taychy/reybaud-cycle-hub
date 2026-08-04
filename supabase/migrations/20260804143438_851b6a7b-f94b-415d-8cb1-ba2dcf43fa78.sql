DO $$
DECLARE
  v_plan RECORD;
  v_updated INT;
BEGIN
  PERFORM set_config('app.sub_internal', 'on', true);

  FOR v_plan IN
    WITH ult AS (
      SELECT DISTINCT ON (plan_id) plan_id, precio_nuevo
      FROM public.precio_historial
      WHERE aplicado_at IS NOT NULL
      ORDER BY plan_id, COALESCE(fecha_vigencia, fecha_cambio::date) DESC, fecha_cambio DESC
    )
    SELECT p.id, p.nombre, p.precio AS precio_actual, u.precio_nuevo AS precio_correcto
    FROM public.planes p
    JOIN ult u ON u.plan_id = p.id
    WHERE p.precio IS DISTINCT FROM u.precio_nuevo
  LOOP
    UPDATE public.planes SET precio = v_plan.precio_correcto WHERE id = v_plan.id;

    UPDATE public.suscripciones s
    SET precio_base = v_plan.precio_correcto,
        precio_final = CASE
          WHEN s.precio_base IS NOT NULL AND s.precio_base > 0 AND s.precio_final IS NOT NULL
            THEN ROUND(v_plan.precio_correcto * (s.precio_final / s.precio_base))
          ELSE v_plan.precio_correcto
        END,
        updated_at = now()
    WHERE s.plan_id = v_plan.id
      AND s.fecha_inicio >= DATE '2026-08-01'
      AND s.fecha_inicio < DATE '2026-09-01'
      AND s.estado = 'pendiente'
      AND s.cancelada_at IS NULL
      AND s.precio_excepcion_tipo IS NULL
      AND s.precio_base IS DISTINCT FROM v_plan.precio_correcto;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    INSERT INTO public.precio_historial (plan_id, precio_anterior, precio_nuevo, fecha_vigencia, aplicar_a, notas, aplicado_at, suscripciones_actualizadas)
    VALUES (v_plan.id, v_plan.precio_actual, v_plan.precio_correcto, DATE '2026-08-01', 'todos',
            'Corrección auditoría agosto: restauración del precio vigente 01/08 tras reproceso fuera de orden', now(), v_updated);
  END LOOP;
END $$;