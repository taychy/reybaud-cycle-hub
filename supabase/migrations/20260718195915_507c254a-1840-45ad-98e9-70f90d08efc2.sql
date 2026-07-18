
CREATE TABLE public.alumno_evaluaciones_coach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL UNIQUE REFERENCES public.alumnos(id) ON DELETE CASCADE,
  coach_id_ultimo uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  postura smallint CHECK (postura BETWEEN 1 AND 5),
  cadencia smallint CHECK (cadencia BETWEEN 1 AND 5),
  manejo smallint CHECK (manejo BETWEEN 1 AND 5),
  potencia smallint CHECK (potencia BETWEEN 1 AND 5),
  postura_nota text,
  cadencia_nota text,
  manejo_nota text,
  potencia_nota text,
  fisico smallint CHECK (fisico BETWEEN 1 AND 5),
  constancia smallint CHECK (constancia BETWEEN 1 AND 5),
  actitud smallint CHECK (actitud BETWEEN 1 AND 5),
  progreso smallint CHECK (progreso BETWEEN 1 AND 5),
  fisico_nota text,
  constancia_nota text,
  actitud_nota text,
  progreso_nota text,
  promedio_tecnico numeric GENERATED ALWAYS AS (
    (COALESCE(postura,0) + COALESCE(cadencia,0) + COALESCE(manejo,0) + COALESCE(potencia,0))::numeric
    / NULLIF(((CASE WHEN postura IS NULL THEN 0 ELSE 1 END)
            + (CASE WHEN cadencia IS NULL THEN 0 ELSE 1 END)
            + (CASE WHEN manejo IS NULL THEN 0 ELSE 1 END)
            + (CASE WHEN potencia IS NULL THEN 0 ELSE 1 END)), 0)
  ) STORED,
  promedio_rendimiento numeric GENERATED ALWAYS AS (
    (COALESCE(fisico,0) + COALESCE(constancia,0) + COALESCE(actitud,0) + COALESCE(progreso,0))::numeric
    / NULLIF(((CASE WHEN fisico IS NULL THEN 0 ELSE 1 END)
            + (CASE WHEN constancia IS NULL THEN 0 ELSE 1 END)
            + (CASE WHEN actitud IS NULL THEN 0 ELSE 1 END)
            + (CASE WHEN progreso IS NULL THEN 0 ELSE 1 END)), 0)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alumno_evaluaciones_coach TO authenticated;
GRANT ALL ON public.alumno_evaluaciones_coach TO service_role;
ALTER TABLE public.alumno_evaluaciones_coach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_eval" ON public.alumno_evaluaciones_coach FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "staff_insert_eval" ON public.alumno_evaluaciones_coach FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "staff_update_eval" ON public.alumno_evaluaciones_coach FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_delete_eval" ON public.alumno_evaluaciones_coach FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_eval_coach_updated
  BEFORE UPDATE ON public.alumno_evaluaciones_coach
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_eval_coach_alumno ON public.alumno_evaluaciones_coach(alumno_id);

CREATE TABLE public.alumno_evaluaciones_coach_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL REFERENCES public.alumnos(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  autor_nombre text,
  nota text NOT NULL,
  snapshot_scores jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alumno_evaluaciones_coach_notas TO authenticated;
GRANT ALL ON public.alumno_evaluaciones_coach_notas TO service_role;
ALTER TABLE public.alumno_evaluaciones_coach_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_eval_notas" ON public.alumno_evaluaciones_coach_notas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "staff_insert_eval_notas" ON public.alumno_evaluaciones_coach_notas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coach'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_delete_eval_notas" ON public.alumno_evaluaciones_coach_notas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_eval_notas_alumno ON public.alumno_evaluaciones_coach_notas(alumno_id, created_at DESC);
