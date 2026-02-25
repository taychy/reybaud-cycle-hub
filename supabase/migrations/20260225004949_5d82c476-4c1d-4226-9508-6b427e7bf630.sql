CREATE TABLE public.entrenamientos_realizados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  entrenamiento_id UUID NOT NULL REFERENCES public.entrenamientos(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(alumno_id, entrenamiento_id)
);

ALTER TABLE public.entrenamientos_realizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert realizados" ON public.entrenamientos_realizados FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view realizados" ON public.entrenamientos_realizados FOR SELECT USING (true);
CREATE POLICY "Admins can manage realizados" ON public.entrenamientos_realizados FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));