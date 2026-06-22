REVOKE EXECUTE ON FUNCTION public.recalculate_reservation_payment_totals(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_reservation_payment_totals(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.materialize_reservation_installments(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.materialize_reservation_installments(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.recalculate_reservation_payment_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_reservation_payment_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_reservation_installments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_reservation_installments(uuid) TO service_role;