
-- Add new columns for coach review workflow
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'checked_in',
  ADD COLUMN IF NOT EXISTS time_value numeric NULL,
  ADD COLUMN IF NOT EXISTS participant_comment text NULL,
  ADD COLUMN IF NOT EXISTS evidence_url text NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL,
  ADD COLUMN IF NOT EXISTS last_request_email_sent_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS request_email_count integer NOT NULL DEFAULT 0;

-- Add RLS policy for coaches to view event participants
CREATE POLICY "Coaches can view event_participants"
  ON public.event_participants
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role));

-- Add RLS policy for coaches to update event participants (approve/reject only)
CREATE POLICY "Coaches can update event_participants"
  ON public.event_participants
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role))
  WITH CHECK (has_role(auth.uid(), 'coach'::app_role));
