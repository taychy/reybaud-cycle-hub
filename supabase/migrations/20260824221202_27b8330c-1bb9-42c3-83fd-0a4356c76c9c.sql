ALTER TABLE public.event_cost_simulations
  ADD COLUMN IF NOT EXISTS escenarios_inscripcion jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS escenario_activo_id text NULL;