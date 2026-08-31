-- Los profesores solo pueden consultar sus ausencias y disponibilidad ajustada.
-- Los cambios oficiales se realizan exclusivamente desde la bandeja de solicitudes.
DROP POLICY IF EXISTS "Coach gestiona sus ausencias" ON public.ausencias_coaches;
DROP POLICY IF EXISTS "Coaches can manage own disp ajustada" ON public.disponibilidad_ajustada;
DROP POLICY IF EXISTS "Coaches ven su disponibilidad ajustada" ON public.disponibilidad_ajustada;

CREATE POLICY "Coaches consultan sus ausencias"
  ON public.ausencias_coaches FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = ausencias_coaches.coach_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Coaches consultan su disponibilidad ajustada"
  ON public.disponibilidad_ajustada FOR SELECT TO authenticated
  USING (
    coach_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.id = disponibilidad_ajustada.coach_id AND c.user_id = auth.uid()
    )
  );