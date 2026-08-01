ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS precio_excepcion_tipo text,
  ADD COLUMN IF NOT EXISTS precio_excepcion_valor numeric,
  ADD COLUMN IF NOT EXISTS precio_excepcion_vigencia_hasta date;

ALTER TABLE public.suscripciones DROP CONSTRAINT IF EXISTS suscripciones_precio_excepcion_tipo_chk;
ALTER TABLE public.suscripciones ADD CONSTRAINT suscripciones_precio_excepcion_tipo_chk
  CHECK (precio_excepcion_tipo IS NULL OR precio_excepcion_tipo IN ('porcentaje','monto_fijo','precio_fijo'));

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
          -- 1) Descuento vigente registrado: se recalcula con su fórmula
          WHEN s.descuento_id IS NOT NULL THEN (
            SELECT CASE
              WHEN d.tipo = 'fijo' THEN GREATEST(0, h.precio_nuevo - d.valor)
              ELSE ROUND(h.precio_nuevo * (1 - d.valor / 100.0), 2)
            END
            FROM public.descuentos d WHERE d.id = s.descuento_id
          )
          -- 2) Excepción porcentual
          WHEN s.precio_excepcion_tipo = 'porcentaje' AND s.precio_excepcion_valor IS NOT NULL
            THEN ROUND(h.precio_nuevo * (1 - s.precio_excepcion_valor / 100.0), 2)
          -- 3) Excepción de monto fijo
          WHEN s.precio_excepcion_tipo = 'monto_fijo' AND s.precio_excepcion_valor IS NOT NULL
            THEN GREATEST(0, h.precio_nuevo - s.precio_excepcion_valor)
          -- 4) Precio fijo / congelado: se mantiene hasta su vencimiento
          WHEN s.precio_excepcion_tipo = 'precio_fijo'
               AND (s.precio_excepcion_vigencia_hasta IS NULL OR s.precio_excepcion_vigencia_hasta >= v_desde)
            THEN COALESCE(s.precio_excepcion_valor, s.precio_final, h.precio_nuevo)
          -- 5) Sin respaldo (o excepción vencida): precio nuevo completo
          ELSE h.precio_nuevo
        END,
        updated_at = now()
    WHERE s.plan_id = h.plan_id
      AND s.estado IN ('activa', 'pendiente')
      AND s.fecha_inicio >= v_desde
      AND s.precio_base IS DISTINCT FROM h.precio_nuevo
      -- Excepción escrita SIN fórmula estructurada: no se propaga nada, va a revisión manual
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

  UPDATE public.precio_historial
  SET aplicado_at = now(),
      suscripciones_actualizadas = v_count
  WHERE id = _historial_id;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_excepciones_revision_manual()
RETURNS TABLE(
  suscripcion_id uuid, alumno_id uuid, alumno_nombre text,
  plan_id uuid, plan_nombre text, fecha_inicio date, fecha_fin date, estado text,
  precio_base numeric, precio_final numeric, diferencia numeric,
  motivo text, motivo_revision text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.alumno_id, a.nombre, s.plan_id, p.nombre,
         s.fecha_inicio, s.fecha_fin, s.estado,
         s.precio_base, s.precio_final,
         ROUND(COALESCE(s.precio_base,0) - COALESCE(s.precio_final,0), 2),
         s.precio_excepcion_motivo,
         'Excepción sin fórmula estructurada (falta tipo/valor/vigencia)'
  FROM public.suscripciones s
  LEFT JOIN public.alumnos a ON a.id = s.alumno_id
  LEFT JOIN public.planes p ON p.id = s.plan_id
  WHERE s.descuento_id IS NULL
    AND s.precio_excepcion_motivo IS NOT NULL
    AND btrim(s.precio_excepcion_motivo) <> ''
    AND s.precio_excepcion_tipo IS NULL
  ORDER BY s.fecha_inicio DESC;
$function$;

CREATE OR REPLACE FUNCTION public.report_precio_final_final_estado()
RETURNS TABLE(
  suscripcion_id uuid, alumno_nombre text, plan_nombre text,
  fecha_inicio date, fecha_fin date, estado text,
  precio_base numeric, precio_final numeric, diferencia numeric,
  clasificacion text, tratamiento text, precio_proxima_renovacion numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.suscripcion_id, r.alumno_nombre, r.plan_nombre,
         r.fecha_inicio, r.fecha_fin, r.estado,
         r.precio_base, r.precio_final, r.diferencia,
         r.clasificacion,
         CASE
           WHEN r.clasificacion IN ('facturado','pagado') THEN 'histórico (sin cambios)'
           WHEN r.clasificacion = 'pendiente' THEN 'condonado (se mantiene importe actual)'
           ELSE 'a revisar'
         END,
         p.precio
  FROM public.report_precio_final_sin_respaldo() r
  LEFT JOIN public.planes p ON p.id = r.plan_id
  ORDER BY r.clasificacion, r.fecha_inicio;
$function$;