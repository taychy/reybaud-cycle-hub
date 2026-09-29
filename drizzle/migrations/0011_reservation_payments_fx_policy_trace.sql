ALTER TABLE public.reservation_payments
  ADD COLUMN IF NOT EXISTS obligation_amount_contract numeric,
  ADD COLUMN IF NOT EXISTS fx_reference_rate numeric,
  ADD COLUMN IF NOT EXISTS fx_base_amount numeric,
  ADD COLUMN IF NOT EXISTS fx_surcharge_pct numeric,
  ADD COLUMN IF NOT EXISTS fx_surcharge_amount numeric,
  ADD COLUMN IF NOT EXISTS payment_policy_snapshot jsonb;
COMMENT ON COLUMN public.reservation_payments.obligation_amount_contract IS 'Obligación en moneda contractual (EUR) que el pago buscaba cubrir, según events.metadata.payment_policy';
COMMENT ON COLUMN public.reservation_payments.fx_reference_rate IS 'ARS por unidad de moneda contractual (venta Reybaud) usada al calcular el pago';
COMMENT ON COLUMN public.reservation_payments.fx_base_amount IS 'Equivalente en moneda de pago antes del recargo';
COMMENT ON COLUMN public.reservation_payments.fx_surcharge_pct IS 'Recargo % aplicado una sola vez sobre fx_base_amount';
COMMENT ON COLUMN public.reservation_payments.fx_surcharge_amount IS 'Importe del recargo en moneda de pago';