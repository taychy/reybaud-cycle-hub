ALTER TABLE public.events 
  ADD COLUMN is_own_event boolean NOT NULL DEFAULT true,
  ADD COLUMN end_date date NULL;