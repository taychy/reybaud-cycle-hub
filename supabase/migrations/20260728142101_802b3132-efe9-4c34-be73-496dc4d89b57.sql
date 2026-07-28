CREATE OR REPLACE FUNCTION public.classify_mp_movement_direccion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  op text;
  sub_unit text;
  collector_id_txt text;
  top_collector text;
  payer_id_txt text;
BEGIN
  op := (NEW.raw->>'operation_type');
  sub_unit := (NEW.raw->'point_of_interaction'->'business_info'->>'sub_unit');
  collector_id_txt := (NEW.raw->'collector'->>'id');
  top_collector := (NEW.raw->>'collector_id');
  payer_id_txt := (NEW.raw->'payer'->>'id');

  IF op = 'partition_transfer' THEN
    NEW.direccion := 'interno';
  ELSIF sub_unit = 'money_outflows'
        AND top_collector IS NOT NULL AND top_collector <> ''
        AND COALESCE(payer_id_txt, '') <> top_collector THEN
    -- Transferencia RECIBIDA: MP la etiqueta como money_outflows pero nosotros somos el collector
    NEW.direccion := 'ingreso';
  ELSIF sub_unit = 'money_outflows' THEN
    NEW.direccion := 'egreso';
  ELSIF op = 'regular_payment' AND collector_id_txt IS NOT NULL AND collector_id_txt <> '' THEN
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

UPDATE public.mp_account_movements
SET direccion = 'ingreso'
WHERE direccion = 'egreso'
  AND gasto_id IS NULL
  AND (raw->'point_of_interaction'->'business_info'->>'sub_unit') = 'money_outflows'
  AND COALESCE(raw->>'collector_id','') <> ''
  AND COALESCE(raw->'payer'->>'id','') <> COALESCE(raw->>'collector_id','');