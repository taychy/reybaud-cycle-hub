
CREATE TABLE public.event_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_slug text NOT NULL DEFAULT 'record-del-ahora',
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  team_name text NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  public_access_token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  token_expires_at timestamptz DEFAULT (now() + interval '30 days'),
  score numeric NULL,
  time_result text NULL,
  position integer NULL,
  staff_feedback text NULL,
  results_updated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_slug, email)
);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

-- Public can insert (check-in)
CREATE POLICY "Anyone can check in to events"
  ON public.event_participants FOR INSERT
  WITH CHECK (true);

-- Public can read by token
CREATE POLICY "Anyone can read by token"
  ON public.event_participants FOR SELECT
  USING (true);

-- Admins can manage all
CREATE POLICY "Admins can manage event_participants"
  ON public.event_participants FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_event_participants_updated_at
  BEFORE UPDATE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
