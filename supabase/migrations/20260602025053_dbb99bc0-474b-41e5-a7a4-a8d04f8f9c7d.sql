-- Datos de facturación del alumno
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS tipo_documento text NOT NULL DEFAULT 'dni' CHECK (tipo_documento IN ('dni','cuit')),
  ADD COLUMN IF NOT EXISTS condicion_fiscal text NOT NULL DEFAULT 'consumidor_final'
    CHECK (condicion_fiscal IN ('consumidor_final','monotributo','responsable_inscripto','exento')),
  ADD COLUMN IF NOT EXISTS nombre_fiscal text,
  ADD COLUMN IF NOT EXISTS domicilio_fiscal text,
  ADD COLUMN IF NOT EXISTS afip_verificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS afip_padron_snapshot jsonb;

COMMENT ON COLUMN public.alumnos.tipo_documento IS 'dni | cuit — tipo del campo documento usado para facturación';
COMMENT ON COLUMN public.alumnos.condicion_fiscal IS 'consumidor_final | monotributo | responsable_inscripto | exento';
COMMENT ON COLUMN public.alumnos.afip_verificado_at IS 'Última verificación exitosa contra el padrón AFIP';
COMMENT ON COLUMN public.alumnos.afip_padron_snapshot IS 'Snapshot de respuesta del padrón AFIP (nombre, condición, domicilio, actividades)';