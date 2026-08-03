CREATE TABLE public.pedidos_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL DEFAULT 'tienda_nube',
  externo_ref text,
  cliente_nombre text NOT NULL,
  cliente_telefono text,
  cliente_email text,
  producto text,
  variante text,
  cantidad numeric NOT NULL DEFAULT 1,
  foto_url text,
  foto_path text,
  sede_id uuid REFERENCES public.sedes(id),
  ubicacion text,
  estado text NOT NULL DEFAULT 'en_deposito',
  notas text,
  ocr_raw jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedidos_externos_estado_check CHECK (estado = ANY (ARRAY['en_deposito','en_camioneta','entregado','devuelto','faltante'])),
  CONSTRAINT pedidos_externos_origen_check CHECK (origen = ANY (ARRAY['tienda_nube','mercado_libre','instagram','otro']))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos_externos TO authenticated;
GRANT ALL ON public.pedidos_externos TO service_role;

ALTER TABLE public.pedidos_externos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deposito y admin gestionan pedidos externos"
ON public.pedidos_externos FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'deposito'::app_role));

CREATE TRIGGER update_pedidos_externos_updated_at
BEFORE UPDATE ON public.pedidos_externos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX pedidos_externos_estado_idx ON public.pedidos_externos(estado);
CREATE INDEX pedidos_externos_sede_idx ON public.pedidos_externos(sede_id);

ALTER TABLE public.vehiculo_carga_items DROP CONSTRAINT IF EXISTS vehiculo_carga_items_source_table_check;
ALTER TABLE public.vehiculo_carga_items ADD CONSTRAINT vehiculo_carga_items_source_table_check
CHECK (source_table = ANY (ARRAY['delivery_list_items','store_order_items','store_preorders','pedidos_externos']));