CREATE TABLE public.store_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text,
  email_cc text,
  telefono text,
  sitio_web text,
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_suppliers TO authenticated;
GRANT ALL ON public.store_suppliers TO service_role;

ALTER TABLE public.store_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage suppliers"
ON public.store_suppliers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_store_suppliers_updated_at
BEFORE UPDATE ON public.store_suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.store_suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS es_externo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_notified_by uuid,
  ADD COLUMN IF NOT EXISTS supplier_order_ref text;

ALTER TYPE public.marketing_contact_type ADD VALUE IF NOT EXISTS 'cliente_tienda';