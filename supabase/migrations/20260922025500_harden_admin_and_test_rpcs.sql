-- Second-pass security hardening: admin RPCs respect RLS; backend/test RPCs are service-role only.
-- Applied directly to the connected Supabase database on 2026-09-22.

BEGIN;

ALTER FUNCTION public.apply_price_change_to_subscriptions(uuid) SECURITY INVOKER;
ALTER FUNCTION public.apply_supplier_shortage_to_delivery(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.reparar_cancelacion_legacy_stock(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.reparar_egreso_capado_legacy(uuid, uuid) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.apply_price_change_to_subscriptions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_supplier_shortage_to_delivery(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reparar_cancelacion_legacy_stock(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reparar_egreso_capado_legacy(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.apply_price_change_to_subscriptions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_supplier_shortage_to_delivery(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reparar_cancelacion_legacy_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reparar_egreso_capado_legacy(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.register_mp_preapproval_identity(text, text, uuid, text, text, numeric, text, uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_nota_credito(uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_mp_preapproval_identity(text, text, uuid, text, text, numeric, text, uuid, timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_nota_credito(uuid, numeric, text, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.run_backfill_preview_tests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_cuenta_corriente_pagos_parciales_tests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_financial_regression_tests_core() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_imputaciones_regression_tests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_programa_bajas_tests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_store_stock_tests() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.run_backfill_preview_tests() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_cuenta_corriente_pagos_parciales_tests() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_financial_regression_tests_core() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_imputaciones_regression_tests() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_programa_bajas_tests() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_store_stock_tests() TO service_role;

COMMIT;
