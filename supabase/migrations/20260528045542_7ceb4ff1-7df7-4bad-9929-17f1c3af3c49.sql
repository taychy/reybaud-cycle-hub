
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_description text,
  ADD COLUMN IF NOT EXISTS preorder_deposit_amount numeric,
  ADD COLUMN IF NOT EXISTS preorder_deposit_percent numeric,
  ADD COLUMN IF NOT EXISTS preorder_total_units integer,
  ADD COLUMN IF NOT EXISTS preorder_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS preorder_estimated_delivery date,
  ADD COLUMN IF NOT EXISTS preorder_status text NOT NULL DEFAULT 'abierta',
  ADD COLUMN IF NOT EXISTS preorder_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.store_products
  DROP CONSTRAINT IF EXISTS store_products_preorder_status_check;
ALTER TABLE public.store_products
  ADD CONSTRAINT store_products_preorder_status_check
  CHECK (preorder_status IN ('abierta','cerrada','cancelada'));

CREATE TABLE IF NOT EXISTS public.store_preorders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE RESTRICT,
  cantidad integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  variante jsonb NOT NULL DEFAULT '{}'::jsonb,
  producto_nombre text NOT NULL,
  precio_unitario numeric NOT NULL,
  moneda text NOT NULL DEFAULT 'ARS',
  sena_monto numeric NOT NULL,
  precio_total numeric NOT NULL,
  saldo_pendiente numeric NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente_pago_sena'
    CHECK (estado IN ('pendiente_pago_sena','reservada','en_produccion','lista_para_retirar','entregada','cancelada','vencida')),
  estado_pago_sena text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_pago_sena IN ('pendiente','pendiente_verificacion','confirmada','rechazada')),
  forma_pago_sena text,
  mp_payment_id text,
  mp_external_reference text,
  notas text,
  cancelada_at timestamptz,
  cancelada_motivo text,
  entregada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_preorders_alumno ON public.store_preorders(alumno_id);
CREATE INDEX IF NOT EXISTS idx_store_preorders_product ON public.store_preorders(product_id);
CREATE INDEX IF NOT EXISTS idx_store_preorders_estado ON public.store_preorders(estado);
CREATE INDEX IF NOT EXISTS idx_store_preorders_mp_payment ON public.store_preorders(mp_payment_id);

GRANT SELECT, INSERT, UPDATE ON public.store_preorders TO authenticated;
GRANT ALL ON public.store_preorders TO service_role;

ALTER TABLE public.store_preorders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alumnos y admins ven preorders"
ON public.store_preorders FOR SELECT TO authenticated
USING (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Alumnos crean sus preorders"
ON public.store_preorders FOR INSERT TO authenticated
WITH CHECK (
  alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Update preorders: admin total, alumno antes de produccion"
ON public.store_preorders FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.is_super_admin(auth.uid())
  OR (
    alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
    AND estado IN ('pendiente_pago_sena','reservada')
  )
);

CREATE POLICY "Solo super admin elimina preorders"
ON public.store_preorders FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_store_preorders_updated ON public.store_preorders;
CREATE TRIGGER trg_store_preorders_updated
BEFORE UPDATE ON public.store_preorders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_preorder_reserved_units(p_product_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(cantidad), 0)::int
  FROM public.store_preorders
  WHERE product_id = p_product_id
    AND estado_pago_sena = 'confirmada'
    AND estado NOT IN ('cancelada','vencida');
$$;

GRANT EXECUTE ON FUNCTION public.get_preorder_reserved_units(uuid) TO authenticated, anon;
