-- ============================================================
-- Reybaud · Tests de regresión del circuito financiero (Fase 1.5)
-- ============================================================
-- Los tests viven en la base como public.run_financial_regression_tests():
-- crean datos de prueba, validan el circuito y REVIERTEN todo lo que crean
-- (no dejan rastro). Se pueden volver a correr después de cada migración.
--
-- Uso:  ./scripts/run-financial-tests.sh
--   (o) psql -f supabase/tests/financial_regression.sql
--
-- Cobertura:
--   1  Asignar MP → suscripción (imputación única, método, mp_status,
--      mp_payment_id, cuenta_mp_id, HABER único, saldo baja una sola vez)
--   2  Idempotencia al asignar dos veces (HABER, notas y saldo estables)
--   3  Desasignar (se borra la evidencia MP, reaparece el saldo) e
--      identificación sin imputar
--   4  Asignar → desasignar → reasignar: estado final idéntico
--   5  Imputar el mismo movimiento a dos obligaciones → falla
--   6  Pago informado por el alumno y aprobado → genera HABER
--   7  Pago informado y rechazado → sin HABER, deuda intacta
--   8  Cambio de plan: plan, precio y moneda coherentes
--   9  Subir planes.precio no modifica el cargo histórico
--   10 get_alumno_payment_targets nunca devuelve obligaciones saldadas
--   11 Identificar y luego imputar no duplica el crédito
-- ============================================================

\timing off
\echo '================ TESTS DE REGRESIÓN FINANCIERA ================'

SELECT * FROM public.run_financial_regression_tests();

SELECT
  count(*) FILTER (WHERE estado = 'PASS') AS pass,
  count(*) FILTER (WHERE estado = 'FAIL') AS fail,
  count(*) AS total
FROM public.run_financial_regression_tests();
