ALTER TABLE public.event_cost_items
  ADD COLUMN IF NOT EXISTS detalle jsonb NOT NULL DEFAULT '{}'::jsonb;