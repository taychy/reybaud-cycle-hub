-- Stage 1: additive fiscal ledger.
-- This migration does NOT replace the current `facturas` flow nor the AFIP/ARCA emitter.
-- It creates the structure needed to import historical fiscal documents and, later,
-- link credit notes to their original invoice without rewriting existing invoices.

CREATE TABLE IF NOT EXISTS public.comprobantes_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emisor_id uuid NOT NULL REFERENCES public.emisores_fiscales(id) ON DELETE RESTRICT,
  factura_id uuid NULL REFERENCES public.facturas(id) ON DELETE SET NULL,

  origen text NOT NULL DEFAULT 'emitido_app'
    CHECK (origen IN ('emitido_app', 'historico_importado')),
  clase text NOT NULL
    CHECK (clase IN ('factura', 'nota_credito', 'nota_debito')),

  -- WSFEv1 types currently supported by Reybaud's fiscal model:
  -- 1 Factura A, 3 NC A, 6 Factura B, 8 NC B, 11 Factura C, 13 NC C.
  tipo_comprobante smallint NOT NULL
    CHECK (tipo_comprobante IN (1, 3, 6, 8, 11, 13)),
  letra char(1) NOT NULL CHECK (letra IN ('A', 'B', 'C')),
  punto_venta integer NOT NULL CHECK (punto_venta > 0),
  numero_comprobante bigint NOT NULL CHECK (numero_comprobante > 0),

  fecha_emision date NOT NULL,
  importe_total numeric(16,2) NOT NULL CHECK (importe_total >= 0),
  moneda text NOT NULL DEFAULT 'PES',

  cliente_doc_tipo integer NULL,
  cliente_doc_nro text NULL,
  cliente_nombre text NULL,

  cae text NULL,
  cae_vencimiento date NULL,

  -- For a credit note this may reference the original fiscal invoice.
  -- Historical imports are allowed to omit it when ARCA export data does not expose the relation.
  comprobante_asociado_id uuid NULL REFERENCES public.comprobantes_fiscales(id) ON DELETE RESTRICT,
  motivo text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT comprobantes_fiscales_tipo_coherente CHECK (
    (tipo_comprobante = 1  AND letra = 'A' AND clase = 'factura') OR
    (tipo_comprobante = 3  AND letra = 'A' AND clase = 'nota_credito') OR
    (tipo_comprobante = 6  AND letra = 'B' AND clase = 'factura') OR
    (tipo_comprobante = 8  AND letra = 'B' AND clase = 'nota_credito') OR
    (tipo_comprobante = 11 AND letra = 'C' AND clase = 'factura') OR
    (tipo_comprobante = 13 AND letra = 'C' AND clase = 'nota_credito')
  ),

  -- ARCA fiscal identity: the same issuer cannot register the same fiscal document twice.
  CONSTRAINT comprobantes_fiscales_identidad_unique
    UNIQUE (emisor_id, tipo_comprobante, punto_venta, numero_comprobante)
);

CREATE UNIQUE INDEX IF NOT EXISTS comprobantes_fiscales_factura_id_unique
  ON public.comprobantes_fiscales (factura_id)
  WHERE factura_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS comprobantes_fiscales_emisor_fecha_idx
  ON public.comprobantes_fiscales (emisor_id, fecha_emision DESC);

CREATE INDEX IF NOT EXISTS comprobantes_fiscales_asociado_idx
  ON public.comprobantes_fiscales (comprobante_asociado_id)
  WHERE comprobante_asociado_id IS NOT NULL;

ALTER TABLE public.comprobantes_fiscales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read fiscal documents" ON public.comprobantes_fiscales;
CREATE POLICY "Admins can read fiscal documents"
  ON public.comprobantes_fiscales
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert fiscal documents" ON public.comprobantes_fiscales;
CREATE POLICY "Admins can insert fiscal documents"
  ON public.comprobantes_fiscales
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update fiscal documents" ON public.comprobantes_fiscales;
CREATE POLICY "Admins can update fiscal documents"
  ON public.comprobantes_fiscales
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete fiscal documents" ON public.comprobantes_fiscales;
CREATE POLICY "Admins can delete fiscal documents"
  ON public.comprobantes_fiscales
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comprobantes_fiscales TO authenticated;

-- New view only. The existing `emisor_facturado_anual` view remains untouched during Stage 1.
CREATE OR REPLACE VIEW public.emisor_facturado_neto_12m
WITH (security_invoker = true)
AS
SELECT
  e.id AS emisor_id,
  e.nombre_fiscal,
  e.cuit,
  COALESCE(
    SUM(
      CASE
        WHEN c.clase = 'nota_credito' THEN -c.importe_total
        ELSE c.importe_total
      END
    ) FILTER (
      WHERE c.fecha_emision >= (CURRENT_DATE - INTERVAL '12 months')::date
        AND c.fecha_emision <= CURRENT_DATE
    ),
    0::numeric
  ) AS facturado_neto_12m,
  COALESCE(
    SUM(c.importe_total) FILTER (
      WHERE c.clase = 'factura'
        AND c.fecha_emision >= (CURRENT_DATE - INTERVAL '12 months')::date
        AND c.fecha_emision <= CURRENT_DATE
    ),
    0::numeric
  ) AS facturas_12m,
  COALESCE(
    SUM(c.importe_total) FILTER (
      WHERE c.clase = 'nota_credito'
        AND c.fecha_emision >= (CURRENT_DATE - INTERVAL '12 months')::date
        AND c.fecha_emision <= CURRENT_DATE
    ),
    0::numeric
  ) AS notas_credito_12m,
  COUNT(c.id) FILTER (
    WHERE c.fecha_emision >= (CURRENT_DATE - INTERVAL '12 months')::date
      AND c.fecha_emision <= CURRENT_DATE
  ) AS comprobantes_12m
FROM public.emisores_fiscales e
LEFT JOIN public.comprobantes_fiscales c ON c.emisor_id = e.id
GROUP BY e.id, e.nombre_fiscal, e.cuit;

GRANT SELECT ON public.emisor_facturado_neto_12m TO authenticated;

COMMENT ON TABLE public.comprobantes_fiscales IS
  'Registro fiscal aditivo de comprobantes ARCA. Incluye documentos emitidos por la app e históricos importados.';
COMMENT ON VIEW public.emisor_facturado_neto_12m IS
  'Neto fiscal móvil de 12 meses: facturas y futuras notas de débito menos notas de crédito. No reemplaza emisor_facturado_anual en Stage 1.';
