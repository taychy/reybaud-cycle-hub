-- 1. Agregar límite anual al emisor
ALTER TABLE public.emisores_fiscales
ADD COLUMN IF NOT EXISTS limite_anual_ars numeric;

COMMENT ON COLUMN public.emisores_fiscales.limite_anual_ars IS
'Tope de facturación anual permitido (categoría monotributo). NULL = sin límite';

-- 2. Agregar segmento a facturas
ALTER TABLE public.facturas
ADD COLUMN IF NOT EXISTS segmento text;

COMMENT ON COLUMN public.facturas.segmento IS
'Segmento de negocio: escuela | viajes | tienda';

CREATE INDEX IF NOT EXISTS idx_facturas_segmento_estado
  ON public.facturas (segmento, estado);

CREATE INDEX IF NOT EXISTS idx_facturas_emisor_fecha
  ON public.facturas (emisor_id, fecha_emision)
  WHERE estado = 'emitida';

-- 3. Tabla de configuración emisor x segmento
CREATE TABLE IF NOT EXISTS public.emisor_segmento_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emisor_id uuid NOT NULL REFERENCES public.emisores_fiscales(id) ON DELETE CASCADE,
  segmento text NOT NULL CHECK (segmento IN ('escuela', 'viajes', 'tienda')),
  habilitado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emisor_id, segmento)
);

ALTER TABLE public.emisor_segmento_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage emisor_segmento_config"
ON public.emisor_segmento_config
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_emisor_segmento_config_updated_at
BEFORE UPDATE ON public.emisor_segmento_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Sembrar configuración: cada emisor existente x cada segmento (deshabilitado por default)
INSERT INTO public.emisor_segmento_config (emisor_id, segmento, habilitado)
SELECT e.id, s.segmento, false
FROM public.emisores_fiscales e
CROSS JOIN (VALUES ('escuela'), ('viajes'), ('tienda')) AS s(segmento)
ON CONFLICT (emisor_id, segmento) DO NOTHING;

-- 5. Vista de facturado anual por emisor (año calendario actual)
CREATE OR REPLACE VIEW public.emisor_facturado_anual
WITH (security_invoker = true)
AS
SELECT
  e.id AS emisor_id,
  e.nombre_fiscal,
  e.cuit,
  e.limite_anual_ars,
  COALESCE(SUM(
    CASE
      WHEN f.estado = 'emitida'
       AND f.fecha_emision >= date_trunc('year', now())
       AND f.fecha_emision <  date_trunc('year', now()) + interval '1 year'
      THEN f.monto
      ELSE 0
    END
  ), 0) AS facturado_anual,
  CASE
    WHEN e.limite_anual_ars IS NULL OR e.limite_anual_ars = 0 THEN NULL
    ELSE ROUND(
      (COALESCE(SUM(
        CASE
          WHEN f.estado = 'emitida'
           AND f.fecha_emision >= date_trunc('year', now())
           AND f.fecha_emision <  date_trunc('year', now()) + interval '1 year'
          THEN f.monto
          ELSE 0
        END
      ), 0) / e.limite_anual_ars) * 100,
      2
    )
  END AS porcentaje_uso,
  CASE
    WHEN e.limite_anual_ars IS NULL OR e.limite_anual_ars = 0 THEN NULL
    ELSE GREATEST(
      e.limite_anual_ars - COALESCE(SUM(
        CASE
          WHEN f.estado = 'emitida'
           AND f.fecha_emision >= date_trunc('year', now())
           AND f.fecha_emision <  date_trunc('year', now()) + interval '1 year'
          THEN f.monto
          ELSE 0
        END
      ), 0),
      0
    )
  END AS cupo_disponible
FROM public.emisores_fiscales e
LEFT JOIN public.facturas f ON f.emisor_id = e.id
GROUP BY e.id, e.nombre_fiscal, e.cuit, e.limite_anual_ars;

COMMENT ON VIEW public.emisor_facturado_anual IS
'Facturado anual del año calendario en curso por emisor, con porcentaje de uso y cupo disponible';