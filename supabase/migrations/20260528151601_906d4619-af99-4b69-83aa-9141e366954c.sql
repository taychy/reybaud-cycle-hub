-- =====================================================================
-- TIENDA v2: Variantes en productos normales + Combos + Checkout in-app
-- =====================================================================

-- ---------- FASE A: store_products extensions ----------
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_stock jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checkout_mode text NOT NULL DEFAULT 'tienda_nube',
  ADD COLUMN IF NOT EXISTS tienda_emisor_id uuid,
  ADD COLUMN IF NOT EXISTS external_url text;

-- Validar checkout_mode
DO $$ BEGIN
  ALTER TABLE public.store_products
    ADD CONSTRAINT store_products_checkout_mode_check
    CHECK (checkout_mode IN ('in_app','tienda_nube'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK opcional a emisores_fiscales
DO $$ BEGIN
  ALTER TABLE public.store_products
    ADD CONSTRAINT store_products_tienda_emisor_fkey
    FOREIGN KEY (tienda_emisor_id) REFERENCES public.emisores_fiscales(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- FASE C: campos para combos ----------
ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS combo_pricing_mode text NOT NULL DEFAULT 'sum',
  ADD COLUMN IF NOT EXISTS combo_price numeric,
  ADD COLUMN IF NOT EXISTS sena_mode text,
  ADD COLUMN IF NOT EXISTS sena_valor numeric;

DO $$ BEGIN
  ALTER TABLE public.store_products
    ADD CONSTRAINT store_products_combo_pricing_mode_check
    CHECK (combo_pricing_mode IN ('sum','fixed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_products
    ADD CONSTRAINT store_products_sena_mode_check
    CHECK (sena_mode IS NULL OR sena_mode IN ('porcentaje','monto_fijo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Nueva tabla: store_combo_items ----------
CREATE TABLE IF NOT EXISTS public.store_combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  component_product_id uuid REFERENCES public.store_products(id) ON DELETE RESTRICT,
  internal_name text,
  internal_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_stock jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_price numeric,
  precio_individual numeric,
  obligatorio boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combo_item_kind_check CHECK (
    (component_product_id IS NOT NULL AND internal_name IS NULL) OR
    (component_product_id IS NULL AND internal_name IS NOT NULL)
  )
);

GRANT SELECT ON public.store_combo_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_combo_items TO authenticated;
GRANT ALL ON public.store_combo_items TO service_role;

ALTER TABLE public.store_combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view combo items of active products"
  ON public.store_combo_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.store_products p
    WHERE p.id = combo_id AND p.status = 'active'
  ));

CREATE POLICY "Admins manage combo items"
  ON public.store_combo_items FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_store_combo_items_combo ON public.store_combo_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_store_combo_items_component ON public.store_combo_items(component_product_id);

CREATE TRIGGER trg_store_combo_items_updated
  BEFORE UPDATE ON public.store_combo_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- store_preorders: combo support ----------
ALTER TABLE public.store_preorders
  ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.store_preorders
    ADD CONSTRAINT store_preorders_modalidad_check
    CHECK (modalidad IN ('individual','combo','split'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- store_orders: pagos in-app ----------
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS mp_status text,
  ADD COLUMN IF NOT EXISTS mp_preference_id text,
  ADD COLUMN IF NOT EXISTS mp_external_reference text,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS origen_registro text,
  ADD COLUMN IF NOT EXISTS pagado_at timestamptz,
  ADD COLUMN IF NOT EXISTS tienda_emisor_id uuid;

DO $$ BEGIN
  ALTER TABLE public.store_orders
    ADD CONSTRAINT store_orders_tienda_emisor_fkey
    FOREIGN KEY (tienda_emisor_id) REFERENCES public.emisores_fiscales(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_store_orders_mp_payment ON public.store_orders(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_alumno ON public.store_orders(alumno_id);

-- RLS para que alumnos vean sus propios pedidos
DROP POLICY IF EXISTS "Alumnos ven sus store_orders" ON public.store_orders;
CREATE POLICY "Alumnos ven sus store_orders"
  ON public.store_orders FOR SELECT
  TO authenticated
  USING (
    alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Alumnos crean sus store_orders" ON public.store_orders;
CREATE POLICY "Alumnos crean sus store_orders"
  ON public.store_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  );

-- ---------- store_order_items: variantes ----------
ALTER TABLE public.store_order_items
  ADD COLUMN IF NOT EXISTS variant_selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS combo_item_id uuid,
  ADD COLUMN IF NOT EXISTS internal_component_idx integer;

DROP POLICY IF EXISTS "Alumnos ven sus store_order_items" ON public.store_order_items;
CREATE POLICY "Alumnos ven sus store_order_items"
  ON public.store_order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.store_orders o
      WHERE o.id = order_id
        AND (
          o.alumno_id IN (SELECT id FROM public.alumnos WHERE user_id = auth.uid())
          OR has_role(auth.uid(), 'admin'::app_role)
          OR is_super_admin(auth.uid())
        )
    )
  );

-- ---------- RPC: cálculo de stock disponible de combo (no preventa) ----------
-- Recibe: combo_id, variant_selection (jsonb: { "<component_id_or_internal_idx>": {"Talle":"M",...} })
-- Devuelve: cantidad máxima vendible (min de cada componente para la variante elegida)
CREATE OR REPLACE FUNCTION public.get_combo_available_stock(
  p_combo_id uuid,
  p_selection jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combo record;
  v_item record;
  v_min integer := NULL;
  v_component_stock integer;
  v_key text;
  v_variant_sig text;
BEGIN
  SELECT * INTO v_combo FROM public.store_products WHERE id = p_combo_id;
  IF v_combo IS NULL OR NOT v_combo.is_combo THEN
    RETURN 0;
  END IF;
  -- Preventa: stock ilimitado (lo gobierna preorder_total_units)
  IF v_combo.is_preorder THEN
    RETURN COALESCE(v_combo.preorder_total_units, 9999);
  END IF;

  FOR v_item IN
    SELECT * FROM public.store_combo_items
    WHERE combo_id = p_combo_id AND obligatorio = true
    ORDER BY sort_order
  LOOP
    v_key := COALESCE(v_item.component_product_id::text, 'i_' || v_item.id::text);
    v_variant_sig := COALESCE(p_selection->>v_key, '');

    IF v_item.component_product_id IS NOT NULL THEN
      -- Stock desde producto reusable
      SELECT
        CASE
          WHEN v_variant_sig <> '' AND (variant_stock ? v_variant_sig)
            THEN (variant_stock->>v_variant_sig)::int
          ELSE stock
        END
      INTO v_component_stock
      FROM public.store_products WHERE id = v_item.component_product_id;
    ELSE
      -- Stock desde internal_stock del propio item
      v_component_stock := COALESCE((v_item.internal_stock->>v_variant_sig)::int, 0);
    END IF;

    v_component_stock := COALESCE(v_component_stock, 0);
    IF v_min IS NULL OR v_component_stock < v_min THEN
      v_min := v_component_stock;
    END IF;
  END LOOP;

  RETURN COALESCE(v_min, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_combo_available_stock(uuid, jsonb) TO anon, authenticated;