
## Tienda · Prendas de prueba (cierre)
- [x] Corregir `prueba_usar_como_cambio` (sin `cambio_in` sobre la prenda de prueba; crear cambio real ligado por `prueba_origen_id`)
- [x] Idempotencia backend en `crear_prenda_prueba` (`prueba_idempotency_key`)
- [x] UI: elegir ítem original del pedido en "Usar como cambio" + key de idempotencia en alta
- [x] Tests SQL `supabase/tests/store_pruebas_stock_regression.sql` + Vitest/typecheck/build
