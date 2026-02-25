CREATE TABLE public.postulaciones_asesoria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_asesoria TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  fecha_nacimiento DATE,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.postulaciones_asesoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create postulaciones" ON public.postulaciones_asesoria FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage postulaciones" ON public.postulaciones_asesoria FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));