
-- Drop the restrictive SELECT policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can read by token" ON public.event_participants;
DROP POLICY IF EXISTS "Coaches can view event_participants" ON public.event_participants;
DROP POLICY IF EXISTS "Admins can manage event_participants" ON public.event_participants;
DROP POLICY IF EXISTS "Anyone can check in to events" ON public.event_participants;
DROP POLICY IF EXISTS "Coaches can update event_participants" ON public.event_participants;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Anyone can read by token"
  ON public.event_participants FOR SELECT
  USING (true);

CREATE POLICY "Coaches can view event_participants"
  ON public.event_participants FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "Admins can manage event_participants"
  ON public.event_participants FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can check in to events"
  ON public.event_participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Coaches can update event_participants"
  ON public.event_participants FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role))
  WITH CHECK (has_role(auth.uid(), 'coach'::app_role));
