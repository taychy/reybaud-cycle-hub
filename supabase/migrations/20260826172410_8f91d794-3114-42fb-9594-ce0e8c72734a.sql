ALTER TABLE public.event_cost_simulations
  ADD COLUMN IF NOT EXISTS paquete_base_id uuid REFERENCES public.event_packages(id) ON DELETE SET NULL;

UPDATE public.event_cost_simulations
SET paquete_base_id = '8aae6d4c-02f7-48fc-9086-b0ad0a27d1a5'
WHERE id = '56394949-ec2a-4809-be98-9085bbc58ab9'
  AND paquete_base_id IS NULL;