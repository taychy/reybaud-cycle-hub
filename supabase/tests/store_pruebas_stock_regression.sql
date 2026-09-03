-- ============================================================
-- Reybaud · Tests de regresión de STOCK de PRENDAS DE PRUEBA
-- ============================================================
-- Viven en la base como public.run_store_pruebas_tests(): crean
-- productos/pedidos/pruebas temporales, ejercitan las RPCs reales y
-- REVIERTEN todo lo que crean (no dejan rastro ni movimientos).
--
-- Uso:  psql -f supabase/tests/store_pruebas_stock_regression.sql
--
-- Cobertura:
--   1 Crear prueba → exactamente 1 `prueba_out`, stock -1
--   2 Misma idempotency key → mismo registro, sin segundo descuento
--   3 Devolver prueba → 1 `prueba_in`; el reintento no duplica
--   4 Convertir en venta → cero movimientos de stock nuevos
--   5 Usar como cambio → cero `cambio_in`/`cambio_out`, se crea el cambio real
--   6 La prueba queda cerrada como prueba (`convertida_en_cambio`)
--   7 Depósito recibe la prenda original → 1 `cambio_in`, 0 `cambio_out`
--   8 Reintentar cierres ya resueltos no mueve stock
-- ============================================================

\timing off
\echo '============ TESTS DE STOCK · PRENDAS DE PRUEBA ============'

SELECT * FROM public.run_store_pruebas_tests();

SELECT
  count(*) FILTER (WHERE estado = 'PASS') AS pass,
  count(*) FILTER (WHERE estado = 'FAIL') AS fail,
  count(*) AS total
FROM public.run_store_pruebas_tests();
