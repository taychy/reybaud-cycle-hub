
CREATE OR REPLACE FUNCTION public.classify_mp_movement_direccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op text;
  sub_unit text;
BEGIN
  op := (NEW.raw->>'operation_type');
  sub_unit := (NEW.raw->'point_of_interaction'->'business_info'->>'sub_unit');

  IF op = 'partition_transfer' THEN
    NEW.direccion := 'interno';
  ELSIF sub_unit = 'money_outflows' THEN
    -- Transferencia SALIENTE (dinero que enviamos desde la cuenta MP)
    NEW.direccion := 'egreso';
  ELSIF op IN ('money_transfer','account_fund','transfer') AND COALESCE(NEW.amount,0) > 0
        AND (NEW.raw->>'status_detail') IN ('accredited','partially_refunded')
        AND (NEW.raw->>'payment_type_id') IN ('bank_transfer','account_money')
        AND (NEW.raw->'payer'->>'type') = 'collector' THEN
    NEW.direccion := 'egreso';
  ELSIF op = 'money_transfer' AND COALESCE(NEW.amount,0) > 0
        AND (NEW.raw->'payer'->>'id') = (NEW.raw->'collector'->>'id') THEN
    NEW.direccion := 'egreso';
  ELSE
    NEW.direccion := 'ingreso';
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: reclasificar transferencias salientes existentes
UPDATE public.mp_account_movements
SET direccion = 'egreso'
WHERE direccion = 'ingreso'
  AND (raw->'point_of_interaction'->'business_info'->>'sub_unit') = 'money_outflows';
