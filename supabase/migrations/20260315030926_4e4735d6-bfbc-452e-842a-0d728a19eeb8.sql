
-- Store categories table
CREATE TABLE public.store_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT '🏷️',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage store_categories" ON public.store_categories FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active store_categories" ON public.store_categories FOR SELECT TO public USING (active = true);

-- Store products table
CREATE TABLE public.store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES public.store_categories(id) ON DELETE SET NULL,
  price numeric NOT NULL,
  old_price numeric,
  discount integer,
  image_url text,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  tag text,
  featured boolean NOT NULL DEFAULT false,
  featured_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage store_products" ON public.store_products FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active store_products" ON public.store_products FOR SELECT TO public USING (status = 'active');

-- Store banners table
CREATE TABLE public.store_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  button_text text,
  link_url text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  start_date date,
  end_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage store_banners" ON public.store_banners FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active store_banners" ON public.store_banners FOR SELECT TO public USING (active = true);

-- Store quick access buttons
CREATE TABLE public.store_quick_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Tag',
  filter_tag text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_quick_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage store_quick_access" ON public.store_quick_access FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active store_quick_access" ON public.store_quick_access FOR SELECT TO public USING (active = true);

-- Store orders table
CREATE TABLE public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number serial,
  alumno_id uuid REFERENCES public.alumnos(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendiente',
  shipping_tracking text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage store_orders" ON public.store_orders FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Store order items
CREATE TABLE public.store_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.store_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage store_order_items" ON public.store_order_items FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default categories
INSERT INTO public.store_categories (name, icon, sort_order) VALUES
  ('Indumentaria', '👕', 1),
  ('Camps', '⛺', 2),
  ('Nutrición', '🥤', 3),
  ('Repuestos', '🔧', 4),
  ('Outlet', '🏷️', 5),
  ('Usados', '♻️', 6);

-- Insert default quick access buttons
INSERT INTO public.store_quick_access (name, icon, filter_tag, sort_order) VALUES
  ('Ofertas', 'Percent', 'OFERTA', 1),
  ('Combos', 'Flame', 'COMBO', 2),
  ('Top ventas', 'Star', 'TOP', 3),
  ('Nuevos', 'Sparkles', 'NUEVO', 4),
  ('Últimas', 'Clock', 'ÚLTIMA UNIDAD', 5);
