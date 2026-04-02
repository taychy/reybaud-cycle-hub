
-- Tipos de descuento configurables por admin
CREATE TABLE public.descuentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'porcentaje',
  categoria TEXT NOT NULL DEFAULT 'general',
  valor NUMERIC NOT NULL DEFAULT 0,
  codigo TEXT UNIQUE,
  max_usos INTEGER,
  usos_actuales INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  aplica_a TEXT NOT NULL DEFAULT 'todo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Asignación de descuentos a alumnos
CREATE TABLE public.descuentos_alumno (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  descuento_id UUID NOT NULL REFERENCES public.descuentos(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT true,
  nota TEXT,
  asignado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(descuento_id, alumno_id)
);

-- RLS descuentos
ALTER TABLE public.descuentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage descuentos" ON public.descuentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active descuentos" ON public.descuentos
  FOR SELECT TO public
  USING (activo = true);

-- RLS descuentos_alumno
ALTER TABLE public.descuentos_alumno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage descuentos_alumno" ON public.descuentos_alumno
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view own descuentos" ON public.descuentos_alumno
  FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM alumnos WHERE user_id = auth.uid()));
