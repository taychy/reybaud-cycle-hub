
-- Add 'viaje' to event_type enum
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'viaje';

-- Add new columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS duration_nights integer,
  ADD COLUMN IF NOT EXISTS max_capacity integer,
  ADD COLUMN IF NOT EXISTS spots_taken integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level text;
