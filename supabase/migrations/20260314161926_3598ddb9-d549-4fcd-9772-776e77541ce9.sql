
-- 1. Create sedes table
CREATE TABLE public.sedes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  direccion TEXT,
  ciudad TEXT,
  provincia TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sedes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active sedes" ON public.sedes
  FOR SELECT TO public USING (activa = true);

CREATE POLICY "Admins can manage sedes" ON public.sedes
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Extend planes table
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS descripcion_corta TEXT,
  ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS clases_por_semana INTEGER,
  ADD COLUMN IF NOT EXISTS acceso_entrenamientos BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acceso_eventos BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceso_beneficios BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renovacion_auto_permitida BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visibilidad TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- 3. Create join table for planes <-> sedes
CREATE TABLE public.planes_sedes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.planes(id) ON DELETE CASCADE,
  sede_id UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  UNIQUE(plan_id, sede_id)
);

ALTER TABLE public.planes_sedes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view planes_sedes" ON public.planes_sedes
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can manage planes_sedes" ON public.planes_sedes
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Create precio_historial table
CREATE TABLE public.precio_historial (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.planes(id) ON DELETE CASCADE,
  precio_anterior NUMERIC NOT NULL,
  precio_nuevo NUMERIC NOT NULL,
  fecha_cambio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fecha_vigencia DATE,
  aplicar_a TEXT NOT NULL DEFAULT 'nuevos',
  modificado_por UUID,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.precio_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage precio_historial" ON public.precio_historial
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Add sede to alumnos
ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS sede_id UUID REFERENCES public.sedes(id);
