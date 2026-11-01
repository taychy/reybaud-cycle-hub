DO $$
DECLARE
  d text := pg_get_viewdef('public.vw_cuenta_corriente_movimientos'::regclass, true);
  n text;
BEGIN
  IF position('COALESCE(rp.alumno_id, er.alumno_id)' in d) > 0 THEN
    RETURN; -- idempotente
  END IF;
  n := replace(d, ' SELECT rp.alumno_id,', ' SELECT COALESCE(rp.alumno_id, er.alumno_id) AS alumno_id,');
  n := replace(n, 'WHERE rp.alumno_id IS NOT NULL AND rp.status', 'WHERE COALESCE(rp.alumno_id, er.alumno_id) IS NOT NULL AND rp.status');
  IF (length(n) - length(d)) <> 2 * (length('COALESCE(rp.alumno_id, er.alumno_id)') - length('rp.alumno_id')) + length(' AS alumno_id') THEN
    RAISE EXCEPTION 'vw_cuenta_corriente_movimientos: patrón inesperado, no se aplica';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_cuenta_corriente_movimientos WITH (security_invoker = true) AS ' || n;
END $$;

COMMENT ON VIEW public.vw_cuenta_corriente_movimientos IS 'Pagos de reserva sin alumno_id propio se atribuyen al titular de la reserva (er.alumno_id); cada reservation_payment aparece una sola vez.';