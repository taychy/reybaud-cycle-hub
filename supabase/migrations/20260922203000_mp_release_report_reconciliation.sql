-- MP reconciliation hardening:
-- 1) release_report rows classify by NET_DEBIT_AMOUNT / NET_CREDIT_AMOUNT.
-- 2) settlement_report remains an enrichment source, not a creator of missing ledger rows.

CREATE OR REPLACE FUNCTION public.classify_mp_movement_direccion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  op text;
  sub_unit text;
  collector_id_txt text;
  top_collector text;
  payer_id_txt text;
  report_net numeric;
  release_debit numeric;
  release_credit numeric;
BEGIN
  IF NEW.raw ? 'release_report' THEN
    BEGIN
      release_debit := NULLIF(
        replace(COALESCE(NEW.raw->'release_report'->>'NET_DEBIT_AMOUNT',''), ',', '.'),
        ''
      )::numeric;
      release_credit := NULLIF(
        replace(COALESCE(NEW.raw->'release_report'->>'NET_CREDIT_AMOUNT',''), ',', '.'),
        ''
      )::numeric;
    EXCEPTION WHEN OTHERS THEN
      release_debit := NULL;
      release_credit := NULL;
    END;

    IF COALESCE(release_debit,0) > 0 THEN
      NEW.direccion := 'egreso';
      RETURN NEW;
    ELSIF COALESCE(release_credit,0) > 0 THEN
      NEW.direccion := 'ingreso';
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.raw ? 'settlement_report' THEN
    BEGIN
      report_net := NULLIF(
        replace(COALESCE(NEW.raw->'settlement_report'->>'SETTLEMENT_NET_AMOUNT',''), ',', '.'),
        ''
      )::numeric;
    EXCEPTION WHEN OTHERS THEN
      report_net := NULL;
    END;

    IF report_net IS NOT NULL AND report_net <> 0 THEN
      NEW.direccion := CASE WHEN report_net < 0 THEN 'egreso' ELSE 'ingreso' END;
      RETURN NEW;
    END IF;
  END IF;

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
$function$;
