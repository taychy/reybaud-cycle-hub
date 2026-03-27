
-- Emisores fiscales (monotributistas configurables)
CREATE TABLE public.emisores_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_fiscal text NOT NULL,
  cuit text NOT NULL,
  punto_venta integer NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.emisores_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage emisores_fiscales"
  ON public.emisores_fiscales FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Facturas
CREATE TABLE public.facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emisor_id uuid REFERENCES public.emisores_fiscales(id) ON DELETE SET NULL,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  cliente_nombre text NOT NULL,
  cliente_cuit text,
  condicion_fiscal text NOT NULL DEFAULT 'consumidor_final',
  concepto text NOT NULL,
  monto numeric NOT NULL,
  estado text NOT NULL DEFAULT 'sin_factura',
  numero_comprobante text,
  cae text,
  cae_vencimiento date,
  fecha_emision timestamptz,
  referencia_tipo text NOT NULL DEFAULT 'manual',
  referencia_id uuid,
  error_detalle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage facturas"
  ON public.facturas FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
