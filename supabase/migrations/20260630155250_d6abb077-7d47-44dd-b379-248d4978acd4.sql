
-- 1) Tabla de etapas de precio por paquete
CREATE TABLE public.event_package_price_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.event_packages(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  precio numeric NOT NULL CHECK (precio >= 0),
  currency text NOT NULL DEFAULT 'ARS',
  vigente_desde timestamptz NOT NULL,
  vigente_hasta timestamptz NULL,
  incremento_pct numeric NULL,
  sort_order integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eppstg_package ON public.event_package_price_stages(package_id, vigente_desde);

GRANT SELECT ON public.event_package_price_stages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_package_price_stages TO authenticated;
GRANT ALL ON public.event_package_price_stages TO service_role;

ALTER TABLE public.event_package_price_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_stages readable by everyone"
  ON public.event_package_price_stages FOR SELECT
  USING (true);

CREATE POLICY "price_stages admin insert"
  ON public.event_package_price_stages FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE POLICY "price_stages admin update"
  ON public.event_package_price_stages FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE POLICY "price_stages admin delete"
  ON public.event_package_price_stages FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE TRIGGER update_eppstg_updated_at
  BEFORE UPDATE ON public.event_package_price_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) price_stage_id opcional en planes de pago (para tener plan distinto por etapa)
ALTER TABLE public.event_package_payment_plans
  ADD COLUMN price_stage_id uuid NULL REFERENCES public.event_package_price_stages(id) ON DELETE CASCADE;

CREATE INDEX idx_eppp_stage ON public.event_package_payment_plans(price_stage_id);

-- 3) Función helper: etapa vigente para un paquete en una fecha
CREATE OR REPLACE FUNCTION public.get_active_price_stage(_package_id uuid, _at timestamptz DEFAULT now())
RETURNS public.event_package_price_stages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.event_package_price_stages
  WHERE package_id = _package_id
    AND activo = true
    AND vigente_desde <= _at
    AND (vigente_hasta IS NULL OR vigente_hasta > _at)
  ORDER BY vigente_desde DESC, sort_order DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_active_price_stage(uuid, timestamptz) TO anon, authenticated, service_role;
