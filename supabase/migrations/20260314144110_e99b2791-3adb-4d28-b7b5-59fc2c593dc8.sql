
-- Attendance table
CREATE TABLE public.asistencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  entrenamiento_id UUID NOT NULL REFERENCES public.entrenamientos(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'ausente' CHECK (estado IN ('asistio', 'ausente', 'justificado')),
  registrado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(alumno_id, entrenamiento_id)
);

ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage asistencias" ON public.asistencias FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can manage asistencias" ON public.asistencias FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role))
  WITH CHECK (has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "Students can view own asistencias" ON public.asistencias FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));

-- Coach feedback table
CREATE TABLE public.feedback_coach (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id UUID NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  entrenamiento_id UUID REFERENCES public.entrenamientos(id) ON DELETE SET NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  comentario TEXT NOT NULL,
  tipo TEXT DEFAULT 'general' CHECK (tipo IN ('tecnica', 'rendimiento', 'actitud', 'recomendacion', 'general')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_coach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage feedback" ON public.feedback_coach FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can manage own feedback" ON public.feedback_coach FOR ALL TO authenticated
  USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()))
  WITH CHECK (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

CREATE POLICY "Students can view own feedback" ON public.feedback_coach FOR SELECT TO authenticated
  USING (alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid()));
