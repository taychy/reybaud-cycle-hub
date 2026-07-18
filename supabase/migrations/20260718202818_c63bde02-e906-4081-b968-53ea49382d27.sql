
ALTER TABLE public.feedback_coach ADD COLUMN IF NOT EXISTS coach_id_secundario uuid REFERENCES public.coaches(id) ON DELETE SET NULL;
ALTER TABLE public.feedback_coach ADD COLUMN IF NOT EXISTS origen text DEFAULT 'directo';
ALTER TABLE public.feedback_coach ADD COLUMN IF NOT EXISTS origen_nota_id uuid REFERENCES public.alumno_evaluaciones_coach_notas(id) ON DELETE SET NULL;

ALTER TABLE public.alumno_evaluaciones_coach_notas ADD COLUMN IF NOT EXISTS feedback_id uuid REFERENCES public.feedback_coach(id) ON DELETE SET NULL;
