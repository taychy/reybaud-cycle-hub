
CREATE TABLE public.delivery_item_check_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.delivery_lists(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.delivery_list_items(id) ON DELETE SET NULL,
  cliente_nombre text NOT NULL,
  producto text NOT NULL,
  variante text,
  cantidad numeric,
  preparado boolean NOT NULL,
  actor_type text NOT NULL DEFAULT 'auth',
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.delivery_item_check_log TO authenticated;
GRANT ALL ON public.delivery_item_check_log TO service_role;

ALTER TABLE public.delivery_item_check_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view delivery check log"
ON public.delivery_item_check_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()) OR has_role(auth.uid(), 'deposito'::app_role));

CREATE INDEX idx_delivery_check_log_list ON public.delivery_item_check_log(list_id, created_at DESC);
CREATE INDEX idx_delivery_check_log_item ON public.delivery_item_check_log(item_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_delivery_item_check_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_type text;
  v_list_title text;
BEGIN
  IF (OLD.preparado IS DISTINCT FROM NEW.preparado) THEN
    v_actor_type := coalesce(current_setting('app.delivery_actor_type', true), 'auth');

    INSERT INTO public.delivery_item_check_log (
      list_id, item_id, cliente_nombre, producto, variante, cantidad,
      preparado, actor_type, actor_user_id
    ) VALUES (
      NEW.list_id, NEW.id, NEW.cliente_nombre, NEW.producto,
      NEW.variante::text, NEW.cantidad, NEW.preparado,
      v_actor_type, auth.uid()
    );

    SELECT titulo INTO v_list_title FROM public.delivery_lists WHERE id = NEW.list_id;

    INSERT INTO public.admin_notification_events (tipo, prioridad, payload)
    VALUES (
      'delivery_check',
      'general',
      jsonb_build_object(
        'list_id', NEW.list_id,
        'list_titulo', v_list_title,
        'item_id', NEW.id,
        'cliente', NEW.cliente_nombre,
        'producto', NEW.producto,
        'variante', NEW.variante,
        'preparado', NEW.preparado,
        'actor_type', v_actor_type,
        'actor_user_id', auth.uid()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_item_check_audit ON public.delivery_list_items;
CREATE TRIGGER trg_delivery_item_check_audit
AFTER UPDATE OF preparado ON public.delivery_list_items
FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_item_check_audit();

CREATE OR REPLACE FUNCTION public.delivery_toggle_item_by_token(_token text, _item_id uuid, _preparado boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_editable boolean;
BEGIN
  SELECT id, public_editable INTO v_list_id, v_editable
  FROM public.delivery_lists WHERE public_token = _token;
  IF v_list_id IS NULL OR NOT v_editable THEN
    RETURN false;
  END IF;
  PERFORM set_config('app.delivery_actor_type', 'public', true);
  UPDATE public.delivery_list_items
    SET preparado = _preparado
  WHERE id = _item_id AND list_id = v_list_id;
  RETURN true;
END;
$$;
