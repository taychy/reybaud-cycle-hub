
-- 1) Table
CREATE TABLE public.delivery_list_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES public.delivery_lists(id) ON DELETE CASCADE,
  cliente_nombre TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL CHECK (monto >= 0),
  moneda TEXT NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD','EUR')),
  forma_pago TEXT NOT NULL,
  monto_esperado NUMERIC(14,2),
  moneda_esperada TEXT,
  forma_pago_esperada TEXT,
  comprobante_path TEXT,
  notas TEXT,
  cargado_por_nombre TEXT,
  cargado_por_email TEXT,
  cargado_por_user_id UUID,
  origen TEXT NOT NULL DEFAULT 'deposito' CHECK (origen IN ('deposito','public','admin')),
  validado BOOLEAN NOT NULL DEFAULT false,
  validado_at TIMESTAMPTZ,
  validado_por UUID,
  validado_notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_payments_list ON public.delivery_list_payments(list_id);
CREATE INDEX idx_delivery_payments_pending ON public.delivery_list_payments(validado) WHERE validado = false;

-- 2) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_list_payments TO authenticated;
GRANT ALL ON public.delivery_list_payments TO service_role;

-- 3) RLS
ALTER TABLE public.delivery_list_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/deposito manage payments"
ON public.delivery_list_payments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'deposito'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'deposito'));

-- 4) updated_at trigger
CREATE TRIGGER trg_delivery_payments_updated
BEFORE UPDATE ON public.delivery_list_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Public RPCs (via delivery list token)
CREATE OR REPLACE FUNCTION public.delivery_add_payment_by_token(
  p_token TEXT,
  p_cliente_nombre TEXT,
  p_monto NUMERIC,
  p_moneda TEXT,
  p_forma_pago TEXT,
  p_comprobante_path TEXT DEFAULT NULL,
  p_notas TEXT DEFAULT NULL,
  p_cargado_por_nombre TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id UUID;
  v_editable BOOLEAN;
  v_new_id UUID;
BEGIN
  SELECT id, public_editable INTO v_list_id, v_editable
  FROM public.delivery_lists
  WHERE public_token = p_token;

  IF v_list_id IS NULL THEN
    RAISE EXCEPTION 'Lista no encontrada';
  END IF;
  IF NOT v_editable THEN
    RAISE EXCEPTION 'Este link no permite cargar cobros';
  END IF;
  IF p_monto IS NULL OR p_monto < 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  IF p_moneda NOT IN ('ARS','USD','EUR') THEN
    RAISE EXCEPTION 'Moneda inválida';
  END IF;

  INSERT INTO public.delivery_list_payments (
    list_id, cliente_nombre, monto, moneda, forma_pago,
    comprobante_path, notas, cargado_por_nombre, origen
  ) VALUES (
    v_list_id, p_cliente_nombre, p_monto, p_moneda, p_forma_pago,
    p_comprobante_path, p_notas, p_cargado_por_nombre, 'public'
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_add_payment_by_token(TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_add_payment_by_token(TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

-- 6) Storage policies for delivery-payments bucket
-- Public upload allowed (needed for delivery person using public link), read restricted
CREATE POLICY "Anyone can upload delivery payment proofs"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'delivery-payments');

CREATE POLICY "Admin/deposito can read delivery payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-payments'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'deposito'))
);

CREATE POLICY "Admin/deposito can update delivery payment proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'delivery-payments'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'deposito'))
);

CREATE POLICY "Admin/deposito can delete delivery payment proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'delivery-payments'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'deposito'))
);
