ALTER TABLE public.emisores_fiscales ADD COLUMN IF NOT EXISTS categoria_monotributo text;

DROP VIEW IF EXISTS public.emisor_facturado_anual;

CREATE VIEW public.emisor_facturado_anual AS
WITH facturado AS (
  SELECT
    e.id AS emisor_id,
    COALESCE(SUM(
      CASE
        WHEN f.cae IS NOT NULL
          AND f.fecha_emision IS NOT NULL
          AND f.fecha_emision >= now() - interval '12 months'
        THEN f.monto
        ELSE 0
      END
    ), 0) AS facturado_anual
  FROM public.emisores_fiscales e
  LEFT JOIN public.facturas f ON f.emisor_id = e.id
  GROUP BY e.id
)
SELECT
  e.id AS emisor_id,
  e.nombre_fiscal,
  e.cuit,
  e.limite_anual_ars,
  fa.facturado_anual,
  CASE
    WHEN e.limite_anual_ars IS NULL OR e.limite_anual_ars = 0 THEN NULL
    ELSE round((fa.facturado_anual / e.limite_anual_ars) * 100, 2)
  END AS porcentaje_uso,
  CASE
    WHEN e.limite_anual_ars IS NULL OR e.limite_anual_ars = 0 THEN NULL
    ELSE GREATEST(e.limite_anual_ars - fa.facturado_anual, 0)
  END AS cupo_disponible
FROM public.emisores_fiscales e
JOIN facturado fa ON fa.emisor_id = e.id;