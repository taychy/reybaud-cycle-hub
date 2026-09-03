
## Tienda · Prendas de prueba (cierre)
- [ ] Corregir `prueba_usar_como_cambio` (sin `cambio_in` sobre la prenda de prueba; crear cambio real ligado por `prueba_origen_id`)
- [ ] Idempotencia backend en `crear_prenda_prueba` (`prueba_idempotency_key`)
- [ ] UI: elegir ítem original del pedido en "Usar como cambio" + key de idempotencia en alta
- [ ] Tests SQL `supabase/tests/store_pruebas_stock_regression.sql` + Vitest/typecheck/build
