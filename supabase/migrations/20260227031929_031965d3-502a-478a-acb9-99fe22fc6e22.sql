
-- Add invite tracking columns to alumnos
ALTER TABLE public.alumnos 
  ADD COLUMN IF NOT EXISTS invite_send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_invite_sent_at timestamptz;

-- Add invite tracking columns to coaches
ALTER TABLE public.coaches 
  ADD COLUMN IF NOT EXISTS invite_send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_invite_sent_at timestamptz;

-- Add invite tracking columns to admin_profiles
ALTER TABLE public.admin_profiles 
  ADD COLUMN IF NOT EXISTS invite_send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_invite_sent_at timestamptz;
