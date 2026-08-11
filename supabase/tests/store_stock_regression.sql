-- ============================================================
-- Reybaud · Tests de regresión del circuito de STOCK de Tienda
-- ============================================================
-- Los tests viven en la base como public.run_store_stock_tests():
-- crean productos/pedidos de prueba, validan el circuito y REVIERTEN
-- todo lo que crean (no dejan rastro). Se pueden volver a correr
-- después de cada migración.
--
-- Uso:  psql -f supabase/tests/store_stock_regression.sql
--
-- Cobertura:
--   1  Venta aprobada descuenta una sola vez (12 → 4)
--   2  Webhook approved repetido → un solo egreso
--   3  pagado → preparando → en_camioneta → entregado no re-descuenta
--   4  Cancelación devuelve exactamente lo que salió
--   5  Cancelar dos veces no devuelve dos veces
--   6  Cancelar un pedido que nunca descontó no incrementa stock
--   7  Variantes: descuenta y devuelve la variante correcta
--   8  Cancelar una variante no afecta a las otras
--   9  Pedido multi-producto: un egreso y una devolución por línea
--   10 Egreso mayor al stock queda visible (no se disimula en 0)
--   11 Cada egreso de venta es trazable (order_item_id + motivo)
--   12 La cancelación deja ingreso compensatorio enlazado al egreso
--   13 Cancelación de alumno y de admin dan el mismo resultado contable
--   14 Una línea sin producto asociado no rompe la transacción
--   15 Cancelación inválida aborta la operación completa
-- ============================================================

\timing off
\echo '================ TESTS DE REGRESIÓN DE STOCK ================'

SELECT * FROM public.run_store_stock_tests();

SELECT
  count(*) FILTER (WHERE estado = 'PASS') AS pass,
  count(*) FILTER (WHERE estado = 'FAIL') AS fail,
  count(*) AS total
FROM public.run_store_stock_tests();

\echo '---------------- DETECTOR DE INCONSISTENCIAS ----------------'
SELECT tipo, severidad, count(*) FROM public.vw_stock_inconsistencias GROUP BY 1,2 ORDER BY 3 DESC;
