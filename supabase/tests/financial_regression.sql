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
--
-- Fase 2 · modelo de imputaciones (tests 101-117):
--   101 Pago total sobre una obligación
--   102 Un pago repartido en varias obligaciones (queda saldo disponible)
--   103 Varias imputaciones sobre la misma obligación
--   104 Pago parcial
--   105 Pago excedente (saldo a favor dentro del mismo pago)
--   106 Saldo a favor reutilizado sin crear ingresos ficticios
--   107 Pago familiar (1 ingreso → 4 obligaciones de 3 alumnos)
--   108 Un pago que cubre evento + mensualidad
--   109 Sobreimputar un pago agotado → falla
--   110 Anular imputación (vuelve el saldo, se libera el pago)
--   111 Anular y reimputar → estado final idéntico
--   112 Idempotencia (misma imputación dos veces = una sola fila)
--   113 El mismo dinero no puede consumirse dos veces
--   114 Invariante: suma de imputaciones ≤ monto del pago
--   115 Saldo de obligación = importe − imputaciones activas
--   116 Saldo disponible del pago = ingreso − imputaciones activas
--   117 Comparación legacy vs modelo nuevo por alumno
-- ============================================================


\timing off
\echo '================ TESTS DE REGRESIÓN FINANCIERA ================'

SELECT * FROM public.run_financial_regression_tests();

SELECT
  count(*) FILTER (WHERE estado = 'PASS') AS pass,
  count(*) FILTER (WHERE estado = 'FAIL') AS fail,
  count(*) AS total
FROM public.run_financial_regression_tests();
