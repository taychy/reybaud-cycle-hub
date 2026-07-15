-- Playbook link: template belongs to a plan (cohorte) optionally
ALTER TABLE public.process_templates
  ADD COLUMN IF NOT EXISTS plan_id uuid NULL REFERENCES public.planes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS process_templates_plan_id_idx
  ON public.process_templates(plan_id)
  WHERE plan_id IS NOT NULL;

-- Instance link: which cohorte this run is executing
ALTER TABLE public.process_instances
  ADD COLUMN IF NOT EXISTS plan_id uuid NULL REFERENCES public.planes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS process_instances_plan_id_idx
  ON public.process_instances(plan_id)
  WHERE plan_id IS NOT NULL;