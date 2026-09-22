-- Critical security hardening for exposed SECURITY DEFINER RPCs and finance views.
-- Applied directly to the connected Supabase database on 2026-09-22.

BEGIN;

ALTER VIEW public.vw_cuenta_corriente_movimientos SET (security_invoker = true);
ALTER VIEW public.vw_backfill_obligaciones SET (security_invoker = true);

ALTER FUNCTION public.get_deudores_cobranzas() SECURITY INVOKER;
ALTER FUNCTION public.get_all_gastos_saldo_deuda() SECURITY INVOKER;
ALTER FUNCTION public.get_efectivo_del_dia(date) SECURITY INVOKER;
ALTER FUNCTION public.get_conciliacion_del_dia(date) SECURITY INVOKER;
ALTER FUNCTION public.get_conciliacion_por_cuenta_del_dia(date) SECURITY INVOKER;
ALTER FUNCTION public.get_efectivo_detalle_del_dia(date, text) SECURITY INVOKER;
ALTER FUNCTION public.finalize_supplier_order_entry(uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_imputar_credito_a_suscripcion(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.generate_gastos_ejecuciones_month(text) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.get_deudores_cobranzas() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_all_gastos_saldo_deuda() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_efectivo_del_dia(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_conciliacion_del_dia(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_conciliacion_por_cuenta_del_dia(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_efectivo_detalle_del_dia(date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_supplier_order_entry(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_imputar_credito_a_suscripcion(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_gastos_ejecuciones_month(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_deudores_cobranzas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_gastos_saldo_deuda() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_efectivo_del_dia(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conciliacion_del_dia(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conciliacion_por_cuenta_del_dia(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_efectivo_detalle_del_dia(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_supplier_order_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imputar_credito_a_suscripcion(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_gastos_ejecuciones_month(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.adjust_store_stock(uuid, text, integer, text, uuid, uuid, uuid, uuid, boolean, cambio_metodo, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._adjust_product_stock(uuid, jsonb, integer, text, uuid, uuid, cambio_metodo, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._adjust_stock_by_key(uuid, text, integer, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._cancel_store_order_core(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_mp_payment_to_gasto(uuid, text, text, numeric, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_gasto_from_mp(text, text, numeric, text, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cuenta_publica_deudas_raw(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.adjust_store_stock(uuid, text, integer, text, uuid, uuid, uuid, uuid, boolean, cambio_metodo, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._adjust_product_stock(uuid, jsonb, integer, text, uuid, uuid, cambio_metodo, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._adjust_stock_by_key(uuid, text, integer, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._cancel_store_order_core(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_mp_payment_to_gasto(uuid, text, text, numeric, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_gasto_from_mp(text, text, numeric, text, date, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cuenta_publica_deudas_raw(uuid) TO service_role;

COMMIT;
