
CREATE TABLE public.product_barcodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  store_product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  variante JSONB,
  proveedor TEXT,
  origen TEXT NOT NULL DEFAULT 'proveedor' CHECK (origen IN ('proveedor','ean','interno','otro')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_barcodes_product ON public.product_barcodes(store_product_id);
CREATE INDEX idx_product_barcodes_codigo ON public.product_barcodes(codigo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT ALL ON public.product_barcodes TO service_role;

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view barcodes" ON public.product_barcodes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'deposito') OR
  public.has_role(auth.uid(), 'coach')
);
CREATE POLICY "Staff can insert barcodes" ON public.product_barcodes
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'deposito')
);
CREATE POLICY "Admin can update barcodes" ON public.product_barcodes
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete barcodes" ON public.product_barcodes
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_product_barcodes_updated
BEFORE UPDATE ON public.product_barcodes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.scan_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL,
  supplier_order_id UUID REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  supplier_order_item_id UUID REFERENCES public.supplier_order_items(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL CHECK (motivo IN ('desconocido','no_corresponde','otro')),
  detalle TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','resuelto','descartado')),
  accion_resolucion TEXT,
  resolved_barcode_id UUID REFERENCES public.product_barcodes(id) ON DELETE SET NULL,
  scanned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scan_incidents_estado ON public.scan_incidents(estado);
CREATE INDEX idx_scan_incidents_order ON public.scan_incidents(supplier_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_incidents TO authenticated;
GRANT ALL ON public.scan_incidents TO service_role;

ALTER TABLE public.scan_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view incidents" ON public.scan_incidents
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'deposito')
);
CREATE POLICY "Staff can insert incidents" ON public.scan_incidents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'deposito')
);
CREATE POLICY "Admin can resolve incidents" ON public.scan_incidents
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete incidents" ON public.scan_incidents
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_scan_incidents_updated
BEFORE UPDATE ON public.scan_incidents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
