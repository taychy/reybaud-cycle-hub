
CREATE TABLE public.event_cost_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  nombre TEXT,
  notas TEXT,
  tc_usd NUMERIC(14,4) NOT NULL DEFAULT 1000,
  tc_eur NUMERIC(14,4) NOT NULL DEFAULT 1100,
  pct_imprevistos NUMERIC(6,3) NOT NULL DEFAULT 5,
  pct_margen_objetivo NUMERIC(6,3) NOT NULL DEFAULT 30,
  moneda_base TEXT NOT NULL DEFAULT 'ARS',
  noches INTEGER NOT NULL DEFAULT 0,
  jornadas INTEGER NOT NULL DEFAULT 0,
  capacidad_total INTEGER NOT NULL DEFAULT 0,
  cantidades_esperadas JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultados JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultados_reales JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado TEXT NOT NULL DEFAULT 'borrador',
  aplicada_a_packages_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, version),
  CONSTRAINT event_cost_simulations_estado_chk CHECK (estado IN ('borrador','activa','archivada'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_cost_simulations TO authenticated;
GRANT ALL ON public.event_cost_simulations TO service_role;
ALTER TABLE public.event_cost_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin manage event cost simulations"
  ON public.event_cost_simulations FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX event_cost_simulations_event_idx ON public.event_cost_simulations(event_id);

CREATE TABLE public.event_cost_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  simulation_id UUID NOT NULL REFERENCES public.event_cost_simulations(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL DEFAULT 'otros',
  descripcion TEXT NOT NULL DEFAULT '',
  cantidad NUMERIC(14,3) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'ARS',
  es_por_persona BOOLEAN NOT NULL DEFAULT false,
  aplica_a_modalidades JSONB NOT NULL DEFAULT '[]'::jsonb,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_cost_items TO authenticated;
GRANT ALL ON public.event_cost_items TO service_role;
ALTER TABLE public.event_cost_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin manage event cost items"
  ON public.event_cost_items FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX event_cost_items_sim_idx ON public.event_cost_items(simulation_id);

CREATE TABLE public.event_cost_actuals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  simulation_id UUID NOT NULL REFERENCES public.event_cost_simulations(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL DEFAULT 'otros',
  descripcion TEXT NOT NULL DEFAULT '',
  monto_real NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'ARS',
  fuente TEXT NOT NULL DEFAULT 'manual',
  gasto_id UUID REFERENCES public.gastos(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_cost_actuals_fuente_chk CHECK (fuente IN ('manual','gasto'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_cost_actuals TO authenticated;
GRANT ALL ON public.event_cost_actuals TO service_role;
ALTER TABLE public.event_cost_actuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin manage event cost actuals"
  ON public.event_cost_actuals FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX event_cost_actuals_sim_idx ON public.event_cost_actuals(simulation_id);

CREATE TRIGGER trg_event_cost_simulations_updated
  BEFORE UPDATE ON public.event_cost_simulations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_event_cost_items_updated
  BEFORE UPDATE ON public.event_cost_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_event_cost_actuals_updated
  BEFORE UPDATE ON public.event_cost_actuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
