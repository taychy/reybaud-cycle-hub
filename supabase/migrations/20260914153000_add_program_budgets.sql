CREATE TABLE public.program_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE REFERENCES public.planes(id) ON DELETE CASCADE,
  participantes_base integer NOT NULL DEFAULT 10 CHECK (participantes_base > 0),
  moneda text NOT NULL DEFAULT 'ARS',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.program_budgets(id) ON DELETE CASCADE,
  categoria text NOT NULL DEFAULT 'Otro',
  concepto text NOT NULL DEFAULT '',
  cantidad numeric(12,2) NOT NULL DEFAULT 1 CHECK (cantidad >= 0),
  costo_unitario numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  costo_real numeric(14,2) CHECK (costo_real IS NULL OR costo_real >= 0),
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX program_budget_items_budget_id_idx ON public.program_budget_items(budget_id);

ALTER TABLE public.program_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_budget_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_budgets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_budget_items TO authenticated;

CREATE POLICY "Admins manage program budgets"
ON public.program_budgets
FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.is_super_admin((SELECT auth.uid())))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.is_super_admin((SELECT auth.uid())));

CREATE POLICY "Admins manage program budget items"
ON public.program_budget_items
FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.is_super_admin((SELECT auth.uid())))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR public.is_super_admin((SELECT auth.uid())));

CREATE TRIGGER update_program_budgets_updated_at
BEFORE UPDATE ON public.program_budgets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_program_budget_items_updated_at
BEFORE UPDATE ON public.program_budget_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
