CREATE POLICY "Coaches can manage own disponibilidad"
ON public.disponibilidad_coaches FOR ALL TO authenticated
USING (coach_id IN (SELECT c.id FROM public.coaches c WHERE c.user_id = auth.uid()))
WITH CHECK (coach_id IN (SELECT c.id FROM public.coaches c WHERE c.user_id = auth.uid()));

CREATE POLICY "Coaches can manage own disp ajustada"
ON public.disponibilidad_ajustada FOR ALL TO authenticated
USING (coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = disponibilidad_ajustada.coach_id AND c.user_id = auth.uid()))
WITH CHECK (coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = disponibilidad_ajustada.coach_id AND c.user_id = auth.uid()));