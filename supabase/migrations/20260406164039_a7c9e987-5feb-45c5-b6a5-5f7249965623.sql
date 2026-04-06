
-- Drop the tables created by the failed partial migration
DROP TABLE IF EXISTS public.grupo_familiar_miembros CASCADE;
DROP TABLE IF EXISTS public.grupo_familiar CASCADE;

-- Create miembros table first (without FK to grupo yet)
CREATE TABLE public.grupo_familiar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  titular_alumno_id UUID REFERENCES public.alumnos(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.grupo_familiar_miembros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID NOT NULL REFERENCES public.grupo_familiar(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  recibe_descuento BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(grupo_id, alumno_id)
);

-- Enable RLS
ALTER TABLE public.grupo_familiar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_familiar_miembros ENABLE ROW LEVEL SECURITY;

-- Policies for grupo_familiar
CREATE POLICY "Admins can manage grupo_familiar"
  ON public.grupo_familiar FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view own grupo_familiar"
  ON public.grupo_familiar FOR SELECT TO authenticated
  USING (id IN (
    SELECT gfm.grupo_id FROM public.grupo_familiar_miembros gfm
    JOIN public.alumnos a ON a.id = gfm.alumno_id
    WHERE a.user_id = auth.uid()
  ));

-- Policies for grupo_familiar_miembros
CREATE POLICY "Admins can manage grupo_familiar_miembros"
  ON public.grupo_familiar_miembros FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view own grupo_familiar_miembros"
  ON public.grupo_familiar_miembros FOR SELECT TO authenticated
  USING (alumno_id IN (
    SELECT a.id FROM public.alumnos a WHERE a.user_id = auth.uid()
  ));

-- Trigger
CREATE TRIGGER update_grupo_familiar_updated_at
  BEFORE UPDATE ON public.grupo_familiar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
