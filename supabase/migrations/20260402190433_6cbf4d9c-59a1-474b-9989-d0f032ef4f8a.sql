
-- Allow coaches to insert movements for themselves
CREATE POLICY "Coaches can insert own movimientos"
ON public.movimientos_liquidacion
FOR INSERT
TO authenticated
WITH CHECK (
  coach_id IN (
    SELECT coaches.id FROM coaches WHERE coaches.user_id = auth.uid()
  )
);
