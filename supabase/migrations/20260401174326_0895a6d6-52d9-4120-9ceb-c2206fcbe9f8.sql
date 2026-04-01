
-- Fix: Add explicit SELECT policy for authenticated admins on entrenamientos
-- The existing ALL policy should cover SELECT, but adding explicit SELECT for clarity
CREATE POLICY "Authenticated admins can read all entrenamientos"
ON public.entrenamientos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Also fix the visible entrenamientos policy to include authenticated users
DROP POLICY IF EXISTS "Anyone can view visible entrenamientos" ON public.entrenamientos;
CREATE POLICY "Anyone can view visible entrenamientos"
ON public.entrenamientos
FOR SELECT
USING (visible = true);

-- Add explicit SELECT for coaches
CREATE POLICY "Coaches can read their group entrenamientos"
ON public.entrenamientos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND grupo IN (
    SELECT unnest(grupos) FROM coaches WHERE user_id = auth.uid()
  )
);
