
-- Table: agenda_grupal - recurring group class schedule for coaches
CREATE TABLE public.agenda_grupal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  honorario_id uuid REFERENCES public.honorarios(id) ON DELETE SET NULL,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=Lunes..6=Domingo
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  grupo text NOT NULL DEFAULT 'General',
  sede_id uuid REFERENCES public.sedes(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.agenda_grupal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agenda_grupal"
ON public.agenda_grupal FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can view own agenda"
ON public.agenda_grupal FOR SELECT TO authenticated
USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));
