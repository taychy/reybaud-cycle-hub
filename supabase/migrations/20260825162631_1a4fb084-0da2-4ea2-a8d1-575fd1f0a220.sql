ALTER TABLE public.event_cost_items
  ADD COLUMN IF NOT EXISTS grupo_costo text;

UPDATE public.event_cost_items
SET grupo_costo = CASE
  WHEN categoria = 'alojamiento' THEN 'alojamiento'
  WHEN categoria = 'staff' THEN 'staff'
  WHEN es_por_persona IS TRUE THEN 'participante'
  ELSE 'general'
END
WHERE grupo_costo IS NULL;

ALTER TABLE public.event_cost_items
  ALTER COLUMN grupo_costo SET DEFAULT 'general';

ALTER TABLE public.event_cost_items
  ADD CONSTRAINT event_cost_items_grupo_costo_check
  CHECK (grupo_costo IS NULL OR grupo_costo IN ('alojamiento','participante','staff','general'));

ALTER TABLE public.event_cost_simulations
  ADD COLUMN IF NOT EXISTS rentabilidad_modo text NOT NULL DEFAULT 'margen',
  ADD COLUMN IF NOT EXISTS honorario_por_participante numeric NOT NULL DEFAULT 0;

ALTER TABLE public.event_cost_simulations
  ADD CONSTRAINT event_cost_simulations_rentabilidad_modo_check
  CHECK (rentabilidad_modo IN ('margen','honorario_participante'));