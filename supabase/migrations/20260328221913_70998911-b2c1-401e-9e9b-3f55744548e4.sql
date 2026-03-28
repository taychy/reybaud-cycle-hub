
-- Expense tracking table
CREATE TABLE public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL DEFAULT 'otros',
  subcategoria text,
  descripcion text NOT NULL,
  monto numeric NOT NULL,
  moneda text NOT NULL DEFAULT 'ARS',
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  recurrente boolean NOT NULL DEFAULT false,
  frecuencia text, -- mensual, trimestral, anual
  proveedor text,
  notas text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

-- Only super_admin can manage expenses
CREATE POLICY "Super admins can manage gastos"
  ON public.gastos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.user_id = auth.uid()
      AND admin_profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.user_id = auth.uid()
      AND admin_profiles.role = 'super_admin'
    )
  );

-- Admins can view expenses (read-only)
CREATE POLICY "Admins can view gastos"
  ON public.gastos FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
