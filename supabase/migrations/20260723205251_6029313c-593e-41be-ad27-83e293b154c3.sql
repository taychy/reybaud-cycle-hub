
ALTER TABLE public.delivery_list_items
  ADD COLUMN IF NOT EXISTS modalidad_retiro text CHECK (modalidad_retiro IN ('sede','envio_correo','envio_moto')),
  ADD COLUMN IF NOT EXISTS sede_retiro_id uuid REFERENCES public.sedes(id);

CREATE TABLE IF NOT EXISTS public.vehiculo_cargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  fecha_salida date NOT NULL DEFAULT current_date,
  entregador_user_id uuid REFERENCES auth.users(id),
  entregador_nombre text,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','en_ruta','cerrada')),
  notas text,
  km_salida numeric,
  km_retorno numeric,
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehiculo_cargas TO authenticated;
GRANT ALL ON public.vehiculo_cargas TO service_role;
ALTER TABLE public.vehiculo_cargas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deposito y admin gestionan cargas" ON public.vehiculo_cargas
  FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role));

CREATE TABLE IF NOT EXISTS public.vehiculo_carga_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id uuid NOT NULL REFERENCES public.vehiculo_cargas(id) ON DELETE CASCADE,
  source_table text NOT NULL CHECK (source_table IN ('delivery_list_items','store_order_items','store_preorders')),
  source_id uuid NOT NULL,
  cliente_nombre text NOT NULL,
  alumno_id uuid,
  producto text,
  variante text,
  cantidad numeric NOT NULL DEFAULT 1,
  estado text NOT NULL DEFAULT 'cargado' CHECK (estado IN ('cargado','entregado','retornado','faltante')),
  entregado_at timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehiculo_carga_items_source_activo_uniq
  ON public.vehiculo_carga_items (source_table, source_id)
  WHERE estado = 'cargado';
CREATE INDEX IF NOT EXISTS vehiculo_carga_items_carga_idx ON public.vehiculo_carga_items(carga_id);
CREATE INDEX IF NOT EXISTS vehiculo_carga_items_source_idx ON public.vehiculo_carga_items(source_table, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehiculo_carga_items TO authenticated;
GRANT ALL ON public.vehiculo_carga_items TO service_role;
ALTER TABLE public.vehiculo_carga_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deposito y admin gestionan carga items" ON public.vehiculo_carga_items
  FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role));

CREATE TRIGGER update_vehiculo_cargas_updated_at
  BEFORE UPDATE ON public.vehiculo_cargas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehiculo_carga_items_updated_at
  BEFORE UPDATE ON public.vehiculo_carga_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_carga_item_from_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.preparado IS TRUE AND (OLD.preparado IS DISTINCT FROM NEW.preparado) THEN
    UPDATE public.vehiculo_carga_items
       SET estado = 'entregado',
           entregado_at = COALESCE(NEW.preparado_at, now())
     WHERE source_table = 'delivery_list_items'
       AND source_id = NEW.id
       AND estado = 'cargado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_carga_from_delivery ON public.delivery_list_items;
CREATE TRIGGER trg_sync_carga_from_delivery
  AFTER UPDATE ON public.delivery_list_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_carga_item_from_delivery();

CREATE OR REPLACE FUNCTION public.cerrar_vehiculo_carga(_carga_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'deposito'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE public.vehiculo_cargas
     SET estado = 'en_ruta', closed_at = now()
   WHERE id = _carga_id AND estado = 'abierta';
END;
$$;
GRANT EXECUTE ON FUNCTION public.cerrar_vehiculo_carga(uuid) TO authenticated;
