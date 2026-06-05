
DO $$ BEGIN
  CREATE TYPE public.unidad_negocio_mp AS ENUM (
    'suscripcion_escuela','viaje_camp','evento','tienda','preventa','personalizado','turnera','otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.modo_mp AS ENUM ('test','prod');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.cuentas_mp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  secret_name_token text NOT NULL,
  secret_name_pubkey text,
  secret_name_webhook text,
  emisor_fiscal_default_id uuid REFERENCES public.emisores_fiscales(id) ON DELETE SET NULL,
  modo public.modo_mp NOT NULL DEFAULT 'prod',
  activa boolean NOT NULL DEFAULT true,
  es_default_global boolean NOT NULL DEFAULT false,
  limite_mensual_ars numeric,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cuentas_mp_one_default_global
  ON public.cuentas_mp ((es_default_global)) WHERE es_default_global = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuentas_mp TO authenticated;
GRANT ALL ON public.cuentas_mp TO service_role;
ALTER TABLE public.cuentas_mp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cuentas_mp"
  ON public.cuentas_mp FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cuenta_mp_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_negocio public.unidad_negocio_mp NOT NULL,
  cuenta_mp_id uuid NOT NULL REFERENCES public.cuentas_mp(id) ON DELETE CASCADE,
  emisor_fiscal_id uuid REFERENCES public.emisores_fiscales(id) ON DELETE SET NULL,
  activa boolean NOT NULL DEFAULT true,
  prioridad int NOT NULL DEFAULT 100,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cuenta_mp_routing_lookup ON public.cuenta_mp_routing(unidad_negocio, activa, prioridad);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuenta_mp_routing TO authenticated;
GRANT ALL ON public.cuenta_mp_routing TO service_role;
ALTER TABLE public.cuenta_mp_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cuenta_mp_routing"
  ON public.cuenta_mp_routing FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER cuentas_mp_set_updated_at
  BEFORE UPDATE ON public.cuentas_mp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER cuenta_mp_routing_set_updated_at
  BEFORE UPDATE ON public.cuenta_mp_routing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.suscripciones        ADD COLUMN IF NOT EXISTS cuenta_mp_id uuid REFERENCES public.cuentas_mp(id) ON DELETE SET NULL;
ALTER TABLE public.reservation_payments ADD COLUMN IF NOT EXISTS cuenta_mp_id uuid REFERENCES public.cuentas_mp(id) ON DELETE SET NULL;
ALTER TABLE public.store_orders         ADD COLUMN IF NOT EXISTS cuenta_mp_id uuid REFERENCES public.cuentas_mp(id) ON DELETE SET NULL;
ALTER TABLE public.store_preorders      ADD COLUMN IF NOT EXISTS cuenta_mp_id uuid REFERENCES public.cuentas_mp(id) ON DELETE SET NULL;
ALTER TABLE public.facturas             ADD COLUMN IF NOT EXISTS cuenta_mp_id uuid REFERENCES public.cuentas_mp(id) ON DELETE SET NULL;
