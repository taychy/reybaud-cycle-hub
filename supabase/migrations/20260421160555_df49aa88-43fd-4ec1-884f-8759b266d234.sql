-- Add event_id to event_participants to separate participants per event
ALTER TABLE public.event_participants
ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

-- Backfill existing rows to the first Record de la hora event (2026-03-01)
UPDATE public.event_participants
SET event_id = 'bec6fdcd-001a-4de8-a70b-164019e7b7a2'
WHERE event_id IS NULL
  AND event_slug = 'record-de-la-hora';

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON public.event_participants(event_id);
