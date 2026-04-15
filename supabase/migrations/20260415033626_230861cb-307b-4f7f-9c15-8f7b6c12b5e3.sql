
-- Table: asesoria_asignaciones
CREATE TABLE public.asesoria_asignaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  activa boolean NOT NULL DEFAULT true,
  notas text,
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(alumno_id, coach_id)
);

ALTER TABLE public.asesoria_asignaciones ENABLE ROW LEVEL SECURITY;

-- RLS: Admins full access
CREATE POLICY "Admins can manage asesoria_asignaciones"
  ON public.asesoria_asignaciones FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Coaches can view their own assignments
CREATE POLICY "Coaches can view own asesoria_asignaciones"
  ON public.asesoria_asignaciones FOR SELECT
  TO authenticated
  USING (coach_id IN (
    SELECT id FROM public.coaches WHERE user_id = auth.uid()
  ));

-- RLS: Students can view own assignments
CREATE POLICY "Students can view own asesoria_asignaciones"
  ON public.asesoria_asignaciones FOR SELECT
  TO authenticated
  USING (alumno_id IN (
    SELECT id FROM public.alumnos WHERE user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE TRIGGER update_asesoria_asignaciones_updated_at
  BEFORE UPDATE ON public.asesoria_asignaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add alumno_id to entrenamientos (NULL = grupal, NOT NULL = personalizado)
ALTER TABLE public.entrenamientos
  ADD COLUMN alumno_id uuid REFERENCES public.alumnos(id) ON DELETE CASCADE;

-- Index for fast lookups
CREATE INDEX idx_entrenamientos_alumno_id ON public.entrenamientos(alumno_id) WHERE alumno_id IS NOT NULL;
CREATE INDEX idx_asesoria_asignaciones_coach ON public.asesoria_asignaciones(coach_id) WHERE activa = true;
CREATE INDEX idx_asesoria_asignaciones_alumno ON public.asesoria_asignaciones(alumno_id) WHERE activa = true;

-- RLS: Students can view their personal entrenamientos
CREATE POLICY "Students can view own personal entrenamientos"
  ON public.entrenamientos FOR SELECT
  TO authenticated
  USING (
    alumno_id IS NOT NULL
    AND alumno_id IN (
      SELECT id FROM public.alumnos WHERE user_id = auth.uid()
    )
  );

-- RLS: Coaches can manage entrenamientos for their asesoria students
CREATE POLICY "Coaches can manage personal entrenamientos for assigned students"
  ON public.entrenamientos FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND alumno_id IS NOT NULL
    AND alumno_id IN (
      SELECT aa.alumno_id FROM public.asesoria_asignaciones aa
      JOIN public.coaches c ON c.id = aa.coach_id
      WHERE c.user_id = auth.uid() AND aa.activa = true
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'coach'::app_role)
    AND alumno_id IS NOT NULL
    AND alumno_id IN (
      SELECT aa.alumno_id FROM public.asesoria_asignaciones aa
      JOIN public.coaches c ON c.id = aa.coach_id
      WHERE c.user_id = auth.uid() AND aa.activa = true
    )
  );
