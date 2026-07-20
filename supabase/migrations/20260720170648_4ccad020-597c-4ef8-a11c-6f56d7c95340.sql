
ALTER TABLE public.delivery_lists
  ADD COLUMN IF NOT EXISTS caja_estado text NOT NULL DEFAULT 'abierta' CHECK (caja_estado IN ('abierta','cerrada')),
  ADD COLUMN IF NOT EXISTS caja_abierta_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS caja_abierta_por uuid,
  ADD COLUMN IF NOT EXISTS caja_cerrada_at timestamptz,
  ADD COLUMN IF NOT EXISTS caja_cerrada_por uuid,
  ADD COLUMN IF NOT EXISTS costo_total_mercaderia numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagado_a_proveedor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda_costo text DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS notas_cierre text,
  ADD COLUMN IF NOT EXISTS proveedor_nombre text;

ALTER TABLE public.delivery_list_items
  ADD COLUMN IF NOT EXISTS costo_unitario numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_venta numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.delivery_supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_list_id uuid NOT NULL REFERENCES public.delivery_lists(id) ON DELETE CASCADE,
  monto numeric NOT NULL CHECK (monto > 0),
  moneda text NOT NULL DEFAULT 'ARS',
  metodo text NOT NULL DEFAULT 'transferencia',
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  notas text,
  comprobante_url text,
  registrado_por uuid,
  registrado_por_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_supplier_payments TO authenticated;
GRANT ALL ON public.delivery_supplier_payments TO service_role;

ALTER TABLE public.delivery_supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan pagos a proveedor"
ON public.delivery_supplier_payments
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'deposito')
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'deposito')
);

CREATE OR REPLACE FUNCTION public.sync_delivery_supplier_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  v_list_id := COALESCE(NEW.delivery_list_id, OLD.delivery_list_id);
  UPDATE public.delivery_lists
  SET pagado_a_proveedor = COALESCE((
    SELECT SUM(monto) FROM public.delivery_supplier_payments WHERE delivery_list_id = v_list_id
  ), 0)
  WHERE id = v_list_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_delivery_supplier_paid ON public.delivery_supplier_payments;
CREATE TRIGGER trg_sync_delivery_supplier_paid
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_supplier_paid();

CREATE OR REPLACE FUNCTION public.enforce_delivery_caja_abierta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_estado text;
BEGIN
  v_list_id := CASE TG_TABLE_NAME
    WHEN 'delivery_list_payments' THEN COALESCE(NEW.list_id, OLD.list_id)
    WHEN 'delivery_supplier_payments' THEN COALESCE(NEW.delivery_list_id, OLD.delivery_list_id)
  END;
  SELECT caja_estado INTO v_estado FROM public.delivery_lists WHERE id = v_list_id;
  IF v_estado = 'cerrada' AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'La caja de esta lista de entrega está cerrada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_caja_payments ON public.delivery_list_payments;
CREATE TRIGGER trg_enforce_caja_payments
BEFORE INSERT OR UPDATE ON public.delivery_list_payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_caja_abierta();

DROP TRIGGER IF EXISTS trg_enforce_caja_supplier ON public.delivery_supplier_payments;
CREATE TRIGGER trg_enforce_caja_supplier
BEFORE INSERT OR UPDATE ON public.delivery_supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_caja_abierta();

CREATE OR REPLACE FUNCTION public.close_delivery_cash(p_list_id uuid, p_notas text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE public.delivery_lists
  SET caja_estado = 'cerrada',
      caja_cerrada_at = now(),
      caja_cerrada_por = auth.uid(),
      notas_cierre = COALESCE(p_notas, notas_cierre)
  WHERE id = p_list_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_delivery_cash(p_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super admin puede reabrir';
  END IF;
  UPDATE public.delivery_lists
  SET caja_estado = 'abierta',
      caja_cerrada_at = NULL,
      caja_cerrada_por = NULL
  WHERE id = p_list_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delivery_list_summary_row(p_list_id uuid)
RETURNS TABLE (
  list_id uuid,
  titulo text,
  caja_estado text,
  items_total int,
  items_entregados int,
  items_pendientes int,
  esperado_cobrar numeric,
  total_cobrado numeric,
  total_cobrado_validado numeric,
  total_pendiente numeric,
  costo_total_mercaderia numeric,
  pagado_a_proveedor numeric,
  saldo_a_proveedor numeric,
  margen_bruto numeric,
  cobros_sin_validar int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dl.id,
    dl.titulo,
    dl.caja_estado,
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_items WHERE list_id = dl.id), 0),
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_items WHERE list_id = dl.id AND preparado = true), 0),
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_items WHERE list_id = dl.id AND preparado = false), 0),
    COALESCE((SELECT SUM(COALESCE(precio_venta,0) * COALESCE(cantidad,1)) FROM delivery_list_items WHERE list_id = dl.id), 0),
    COALESCE((SELECT SUM(monto) FROM delivery_list_payments WHERE list_id = dl.id), 0),
    COALESCE((SELECT SUM(monto) FROM delivery_list_payments WHERE list_id = dl.id AND validado = true), 0),
    COALESCE((SELECT SUM(COALESCE(precio_venta,0) * COALESCE(cantidad,1)) FROM delivery_list_items WHERE list_id = dl.id), 0)
      - COALESCE((SELECT SUM(monto) FROM delivery_list_payments WHERE list_id = dl.id), 0),
    COALESCE(dl.costo_total_mercaderia, 0),
    COALESCE(dl.pagado_a_proveedor, 0),
    COALESCE(dl.costo_total_mercaderia, 0) - COALESCE(dl.pagado_a_proveedor, 0),
    COALESCE((SELECT SUM(monto) FROM delivery_list_payments WHERE list_id = dl.id), 0) - COALESCE(dl.costo_total_mercaderia, 0),
    COALESCE((SELECT COUNT(*)::int FROM delivery_list_payments WHERE list_id = dl.id AND (validado IS NULL OR validado = false)), 0)
  FROM delivery_lists dl
  WHERE dl.id = p_list_id;
$$;

GRANT EXECUTE ON FUNCTION public.close_delivery_cash(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_delivery_cash(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_list_summary_row(uuid) TO authenticated;

UPDATE public.delivery_lists SET caja_abierta_at = COALESCE(caja_abierta_at, created_at, now()) WHERE caja_abierta_at IS NULL;
