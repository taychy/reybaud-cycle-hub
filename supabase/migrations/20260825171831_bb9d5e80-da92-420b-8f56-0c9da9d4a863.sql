ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS tipo_comprobante integer,
  ADD COLUMN IF NOT EXISTS letra_comprobante text;

COMMENT ON COLUMN public.facturas.tipo_comprobante IS 'Código AFIP real del comprobante emitido, por ejemplo 11=C, 6=B, 1=A.';
COMMENT ON COLUMN public.facturas.letra_comprobante IS 'Letra real del comprobante emitido, por ejemplo C, B o A.';