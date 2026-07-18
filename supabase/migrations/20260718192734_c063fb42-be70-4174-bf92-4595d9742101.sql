
-- 1) Ampliar el check constraint para incluir 'interno'
ALTER TABLE public.mp_account_movements
  DROP CONSTRAINT IF EXISTS mp_account_movements_direccion_check;

ALTER TABLE public.mp_account_movements
  ADD CONSTRAINT mp_account_movements_direccion_check
  CHECK (direccion IN ('ingreso','egreso','reserva_tecnica','interno'));

-- 2) Actualizar clasificador: partition_transfer => 'interno'
CREATE OR REPLACE FUNCTION public.classify_mp_movement_direccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op text;
BEGIN
  op := (NEW.raw->>'operation_type');
  IF op = 'partition_transfer' THEN
    NEW.direccion := 'interno';
  ELSIF op IN ('money_transfer','account_fund','transfer') AND COALESCE(NEW.amount,0) > 0
        AND (NEW.raw->>'status_detail') IN ('accredited','partially_refunded')
        AND (NEW.raw->>'payment_type_id') IN ('bank_transfer','account_money')
        AND (NEW.raw->'payer'->>'type') = 'collector' THEN
    -- Transferencia SALIENTE (el propio collector figura como payer)
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

-- 3) Backfill: reclasificar partition_transfer existentes
UPDATE public.mp_account_movements
SET direccion = 'interno'
WHERE (raw->>'operation_type') = 'partition_transfer';
