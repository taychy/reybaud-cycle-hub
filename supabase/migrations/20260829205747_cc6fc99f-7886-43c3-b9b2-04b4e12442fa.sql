CREATE TABLE IF NOT EXISTS public.coach_sedes (
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  sede_id uuid NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, sede_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_sedes_sede ON public.coach_sedes(sede_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_sedes TO authenticated;
GRANT ALL ON public.coach_sedes TO service_role;

ALTER TABLE public.coach_sedes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coach_sedes"
ON public.coach_sedes FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view coach_sedes"
ON public.coach_sedes FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.coach_sedes (coach_id, sede_id)
SELECT c.id, c.sede_id
FROM public.coaches c
WHERE c.sede_id IS NOT NULL
ON CONFLICT (coach_id, sede_id) DO NOTHING;