ALTER TABLE public.event_rooms
  ADD COLUMN IF NOT EXISTS tipo text
  CHECK (tipo IN ('individual','doble','triple','cuadruple','cabana','dormitorio'));

COMMENT ON COLUMN public.event_rooms.tipo IS
  'Tipo de alojamiento: individual, doble, triple, cuadruple, cabana, dormitorio. Se usa para el nombre auto-generado y el reporte al proveedor.';