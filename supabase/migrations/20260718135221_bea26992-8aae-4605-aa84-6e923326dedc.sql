
CREATE TABLE public.delivery_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  fecha_entrega date,
  estado text NOT NULL DEFAULT 'abierta',
  origen text NOT NULL DEFAULT 'manual',
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  public_editable boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_lists TO authenticated;
GRANT ALL ON public.delivery_lists TO service_role;

ALTER TABLE public.delivery_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_lists_staff_all" ON public.delivery_lists
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'deposito'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'deposito'::app_role)
  );

CREATE INDEX delivery_lists_estado_idx ON public.delivery_lists(estado);
CREATE INDEX delivery_lists_fecha_idx ON public.delivery_lists(fecha_entrega);

CREATE TABLE public.delivery_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.delivery_lists(id) ON DELETE CASCADE,
  cliente_nombre text NOT NULL,
  cliente_alumno_id uuid,
  producto text NOT NULL,
  variante text,
  cantidad numeric NOT NULL DEFAULT 1,
  notas text,
  preparado boolean NOT NULL DEFAULT false,
  preparado_at timestamptz,
  preparado_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type text,
  source_order_id uuid,
  source_order_item_id uuid,
  source_preorder_id uuid,
  posicion int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_list_items TO authenticated;
GRANT ALL ON public.delivery_list_items TO service_role;

ALTER TABLE public.delivery_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_list_items_staff_all" ON public.delivery_list_items
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'deposito'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'deposito'::app_role)
  );

CREATE INDEX delivery_list_items_list_idx ON public.delivery_list_items(list_id);
CREATE INDEX delivery_list_items_cliente_idx ON public.delivery_list_items(list_id, cliente_nombre);
CREATE INDEX delivery_list_items_order_idx ON public.delivery_list_items(source_order_id) WHERE source_order_id IS NOT NULL;
CREATE INDEX delivery_list_items_preorder_idx ON public.delivery_list_items(source_preorder_id) WHERE source_preorder_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_delivery_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_lists_touch BEFORE UPDATE ON public.delivery_lists
  FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_touch_updated_at();

CREATE TRIGGER delivery_list_items_touch BEFORE UPDATE ON public.delivery_list_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_delivery_item_before_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.preparado AND NOT COALESCE(OLD.preparado, false) THEN
    NEW.preparado_at := now();
  ELSIF NOT NEW.preparado THEN
    NEW.preparado_at := NULL;
    NEW.preparado_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_list_items_before_update_prep
  BEFORE UPDATE ON public.delivery_list_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_item_before_update();

CREATE OR REPLACE FUNCTION public.tg_delivery_propagate_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending int;
BEGIN
  IF NEW.preparado AND NOT COALESCE(OLD.preparado, false) THEN
    IF NEW.source_order_id IS NOT NULL THEN
      SELECT count(*) INTO v_pending
      FROM public.delivery_list_items
      WHERE list_id = NEW.list_id
        AND source_order_id = NEW.source_order_id
        AND preparado = false;
      IF v_pending = 0 THEN
        UPDATE public.store_orders
          SET status = 'entregado', delivered_at = COALESCE(delivered_at, now())
          WHERE id = NEW.source_order_id AND status <> 'entregado';
      END IF;
    END IF;
    IF NEW.source_preorder_id IS NOT NULL THEN
      SELECT count(*) INTO v_pending
      FROM public.delivery_list_items
      WHERE list_id = NEW.list_id
        AND source_preorder_id = NEW.source_preorder_id
        AND preparado = false;
      IF v_pending = 0 THEN
        UPDATE public.store_preorders
          SET estado = 'entregada',
              entregada_at = COALESCE(entregada_at, now()),
              delivered_at = COALESCE(delivered_at, now())
          WHERE id = NEW.source_preorder_id AND estado <> 'entregada';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_list_items_after_update_prop
  AFTER UPDATE ON public.delivery_list_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_propagate_delivered();

CREATE OR REPLACE FUNCTION public.delivery_get_by_token(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_list public.delivery_lists;
  v_items jsonb;
BEGIN
  SELECT * INTO v_list FROM public.delivery_lists WHERE public_token = _token;
  IF v_list.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(i.*) ORDER BY i.cliente_nombre, i.posicion, i.created_at), '[]'::jsonb)
    INTO v_items
  FROM public.delivery_list_items i
  WHERE i.list_id = v_list.id;
  RETURN jsonb_build_object(
    'list', row_to_json(v_list.*),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delivery_toggle_item_by_token(_token text, _item_id uuid, _preparado boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_list_id uuid;
  v_editable boolean;
BEGIN
  SELECT id, public_editable INTO v_list_id, v_editable
  FROM public.delivery_lists WHERE public_token = _token;
  IF v_list_id IS NULL OR NOT v_editable THEN
    RETURN false;
  END IF;
  UPDATE public.delivery_list_items
    SET preparado = _preparado
  WHERE id = _item_id AND list_id = v_list_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delivery_get_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_toggle_item_by_token(text, uuid, boolean) TO anon, authenticated;
