
CREATE TABLE public.ausencias_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  todo_el_dia BOOLEAN NOT NULL DEFAULT true,
  hora_inicio TIME,
  hora_fin TIME,
  motivo TEXT,
  creado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ausencias_coaches_fecha_check CHECK (fecha_fin >= fecha_inicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ausencias_coaches TO authenticated;
GRANT SELECT ON public.ausencias_coaches TO anon;
GRANT ALL ON public.ausencias_coaches TO service_role;

ALTER TABLE public.ausencias_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de ausencias"
ON public.ausencias_coaches FOR SELECT
USING (true);

CREATE POLICY "Admins gestionan ausencias"
ON public.ausencias_coaches FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coach gestiona sus ausencias"
ON public.ausencias_coaches FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = ausencias_coaches.coach_id AND c.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = ausencias_coaches.coach_id AND c.user_id = auth.uid())
);

CREATE INDEX idx_ausencias_coach_fechas ON public.ausencias_coaches (coach_id, fecha_inicio, fecha_fin);

CREATE TRIGGER trg_ausencias_coaches_updated_at
BEFORE UPDATE ON public.ausencias_coaches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
