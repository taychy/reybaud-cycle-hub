ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS nombres_bancarios text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.alumnos.nombres_bancarios IS
  'Alias o titulares con los que aparece el alumno en transferencias bancarias / MP (p.ej. cuenta de pareja, empresa, padre). Sirve para conciliar pagos y para que el buscador de alumnos los encuentre por esos nombres.';

CREATE INDEX IF NOT EXISTS idx_alumnos_nombres_bancarios_gin
  ON public.alumnos USING gin (nombres_bancarios);