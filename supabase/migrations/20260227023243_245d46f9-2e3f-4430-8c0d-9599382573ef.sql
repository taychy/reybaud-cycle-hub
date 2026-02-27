ALTER TABLE public.coaches 
  ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invited_at timestamp with time zone;