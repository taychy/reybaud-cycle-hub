-- Create deposito_profiles table
CREATE TABLE public.deposito_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  email text NOT NULL,
  password_set boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'activo',
  invite_send_count integer NOT NULL DEFAULT 0,
  last_invite_sent_at timestamptz,
  invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deposito_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage deposito_profiles"
  ON public.deposito_profiles FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deposito can view own profile"
  ON public.deposito_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Deposito can update own profile"
  ON public.deposito_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create stock_movements table
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'ingreso',
  cantidad integer NOT NULL,
  stock_anterior integer NOT NULL,
  stock_nuevo integer NOT NULL,
  motivo text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage stock_movements"
  ON public.stock_movements FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deposito can manage stock_movements"
  ON public.stock_movements FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'deposito'::app_role))
  WITH CHECK (has_role(auth.uid(), 'deposito'::app_role));

-- Allow deposito role to read and update store_products
CREATE POLICY "Deposito can view store_products"
  ON public.store_products FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'deposito'::app_role));

CREATE POLICY "Deposito can update store_products stock"
  ON public.store_products FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'deposito'::app_role))
  WITH CHECK (has_role(auth.uid(), 'deposito'::app_role));