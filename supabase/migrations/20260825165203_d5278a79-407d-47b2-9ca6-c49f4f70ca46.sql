-- 1) Vínculo explícito factura ↔ fila de cola
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS facturacion_cola_id uuid NULL
  REFERENCES public.facturacion_cola(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS facturas_facturacion_cola_id_uniq
  ON public.facturas (facturacion_cola_id)
  WHERE facturacion_cola_id IS NOT NULL;

-- 2) Backfill conservador: sólo cuando el factura_id aparece en EXACTAMENTE una fila de cola
WITH unicos AS (
  SELECT c.factura_id, (array_agg(c.id))[1] AS cola_id
  FROM public.facturacion_cola c
  WHERE c.factura_id IS NOT NULL
  GROUP BY c.factura_id
  HAVING COUNT(*) = 1
)
UPDATE public.facturas f
SET facturacion_cola_id = u.cola_id
FROM unicos u
WHERE f.id = u.factura_id
  AND f.facturacion_cola_id IS NULL;

-- 3) Trigger de sincronización exacto (backward compatible)
CREATE OR REPLACE FUNCTION public.tg_facturas_sync_cola()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cola_id uuid;
  v_count int;
BEGIN
  IF NEW.facturacion_cola_id IS NOT NULL THEN
    UPDATE public.facturacion_cola c
    SET estado = CASE
          WHEN NEW.estado = 'emitida' AND NEW.cae IS NOT NULL THEN 'facturada'
          ELSE c.estado
        END,
        factura_id = NEW.id
    WHERE c.id = NEW.facturacion_cola_id
      AND c.estado <> 'anulada';
    RETURN NEW;
  END IF;

  -- Legacy: sólo si hay EXACTAMENTE una fila de cola compatible
  IF NEW.estado = 'emitida' AND NEW.cae IS NOT NULL THEN
    SELECT COUNT(*), (array_agg(c.id))[1] INTO v_count, v_cola_id
    FROM public.facturacion_cola c
    WHERE c.referencia_tipo = NEW.referencia_tipo
      AND c.referencia_id = NEW.referencia_id
      AND (c.factura_id IS NULL OR c.factura_id = NEW.id)
      AND c.estado <> 'anulada';

    IF v_count = 1 THEN
      UPDATE public.facturacion_cola c
      SET estado = 'facturada',
          factura_id = NEW.id
      WHERE c.id = v_cola_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Dashboard de facturación en una sola consulta (admin-only)
CREATE OR REPLACE FUNCTION public.get_billing_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pendientes int;
  v_problemas int;
  v_emitidas_mes int;
  v_emitidas_total int;
  v_monto_pendiente numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(c.monto), 0)
    INTO v_pendientes, v_monto_pendiente
  FROM public.facturacion_cola c
  WHERE c.estado = 'pendiente'
    AND NOT EXISTS (
      SELECT 1 FROM public.facturas f
      WHERE (f.facturacion_cola_id = c.id OR f.id = c.factura_id)
        AND f.estado = 'emitida' AND f.cae IS NOT NULL
    );

  SELECT COUNT(*) INTO v_problemas
  FROM public.facturas f
  WHERE f.estado = 'error'
     OR (f.estado = 'emitida' AND f.cae IS NULL);

  SELECT COUNT(*) FILTER (
      WHERE COALESCE(f.fecha_emision::date, f.created_at::date)
            >= date_trunc('month', now())::date
    ),
    COUNT(*)
    INTO v_emitidas_mes, v_emitidas_total
  FROM public.facturas f
  WHERE f.estado = 'emitida' AND f.cae IS NOT NULL;

  RETURN jsonb_build_object(
    'pendientes', v_pendientes,
    'monto_pendiente', v_monto_pendiente,
    'problemas', v_problemas,
    'emitidas_mes', v_emitidas_mes,
    'emitidas_total', v_emitidas_total
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_billing_dashboard() TO authenticated;

-- 5) Corregir estado mal escrito en métricas ('facturado' -> 'facturada')
CREATE OR REPLACE FUNCTION public.get_facturacion_metrics(_desde date DEFAULT '2026-07-01'::date)
RETURNS TABLE(pendientes integer, facturados integer, errores integer, tasa_exito numeric, antiguedad_mas_viejo_horas numeric, monto_pendiente numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE estado IN ('pendiente','error'))::int,
    COUNT(*) FILTER (WHERE estado = 'facturada')::int,
    COUNT(*) FILTER (WHERE estado = 'error')::int,
    ROUND(100.0 * COUNT(*) FILTER (WHERE estado = 'facturada') / NULLIF(COUNT(*), 0), 2),
    ROUND(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE estado IN ('pendiente','error')))) / 3600.0, 1),
    COALESCE(SUM(monto) FILTER (WHERE estado IN ('pendiente','error')), 0)
  FROM public.facturacion_cola
  WHERE created_at::date >= _desde;
$function$;