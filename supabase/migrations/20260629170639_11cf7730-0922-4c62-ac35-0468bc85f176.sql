
CREATE SEQUENCE IF NOT EXISTS public.supplier_orders_numero_seq START 1;

CREATE TABLE public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE DEFAULT ('PP-' || lpad(nextval('public.supplier_orders_numero_seq')::text, 4, '0')),
  proveedor_nombre text NOT NULL,
  proveedor_contacto text,
  fecha_pedido date NOT NULL DEFAULT current_date,
  fecha_estimada_entrega date,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','recibido_parcial','cerrado','cancelado')),
  notas text,
  total_estimado numeric DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_orders TO authenticated;
GRANT ALL ON public.supplier_orders TO service_role;
GRANT USAGE ON SEQUENCE public.supplier_orders_numero_seq TO authenticated;

ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage supplier orders"
  ON public.supplier_orders FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'deposito'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'deposito'));

CREATE TABLE public.supplier_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_order_id uuid NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.store_products(id) ON DELETE SET NULL,
  producto_nombre text NOT NULL,
  variante jsonb DEFAULT '{}'::jsonb,
  cantidad_pedida integer NOT NULL DEFAULT 1 CHECK (cantidad_pedida >= 0),
  cantidad_recibida integer NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  precio_unitario numeric,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_order_items TO authenticated;
GRANT ALL ON public.supplier_order_items TO service_role;

ALTER TABLE public.supplier_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage supplier order items"
  ON public.supplier_order_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'deposito'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'deposito'));

CREATE INDEX idx_supplier_order_items_order ON public.supplier_order_items(supplier_order_id);
CREATE INDEX idx_supplier_orders_estado ON public.supplier_orders(estado);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_orders_updated_at
  BEFORE UPDATE ON public.supplier_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_supplier_order_items_updated_at
  BEFORE UPDATE ON public.supplier_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  v_tpl_id uuid;
BEGIN
  SELECT id INTO v_tpl_id FROM public.process_templates WHERE nombre ILIKE 'Ingreso de mercader%' LIMIT 1;
  IF v_tpl_id IS NULL THEN
    INSERT INTO public.process_templates (nombre, descripcion, rol_destino, icono, activo)
    VALUES ('Ingreso de mercadería', 'Recepción, control contra pedido y cierre.', 'deposito', 'PackagePlus', true)
    RETURNING id INTO v_tpl_id;

    INSERT INTO public.process_template_stages (template_id, orden, titulo, instrucciones, requiere_foto, requiere_nota, entidad_control, accion_final)
    VALUES
      (v_tpl_id, 1, 'Recepción', 'Sacá foto a la factura del proveedor y anotá cualquier observación de la caja.', true, false, 'none', 'none'),
      (v_tpl_id, 2, 'Control contra pedido', 'Elegí el pedido al proveedor y chequeá ítem por ítem.', false, false, 'supplier_order', 'none'),
      (v_tpl_id, 3, 'Reporte y cierre', 'Confirmá para enviar el reporte por mail.', false, false, 'none', 'send_report');
  END IF;
END$$;
