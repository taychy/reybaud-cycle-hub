
## Tienda · Prendas de prueba (cierre)
- [x] Corregir `prueba_usar_como_cambio` (sin `cambio_in` sobre la prenda de prueba; crear cambio real ligado por `prueba_origen_id`)
- [x] Idempotencia backend en `crear_prenda_prueba` (`prueba_idempotency_key`)
- [x] UI: elegir ítem original del pedido en "Usar como cambio" + key de idempotencia en alta
- [x] Tests SQL `supabase/tests/store_pruebas_stock_regression.sql` + Vitest/typecheck/build

## Admin > Alumnos · Filtros agrupados (UI)
- [x] Chips primarios (Todos/Activos/Pendientes/Vencidos/Nuevos) + menús Estado/Acceso/Plan/Calidad de datos

- [x] Entrenamientos semanales por email: preferencia por alumno (OFF por defecto), envío manual con vista previa y cron dominical 18:00 AR (21:00 UTC). Fuente única: RPC get_entrenamientos_semana_alumno + helper src/lib/weeklyTraining.ts.

## Tienda · Pago en efectivo (preview)
- [x] Checkout público con opción "Efectivo al retirar" (sin Mercado Pago, pedido pendiente de cobro)
- [x] Confirmar pago en efectivo desde Depósito y Admin, con reglas únicas en `src/lib/storeCashPayment.ts` (idempotente, bloquea pedidos ya pagados o anulados)

## Tienda · Campañas condicionadas por forma de pago (preview)
- [x] Campo `medios_pago` en campañas (default ambos), UI Admin, resolver backend por medio y checkout público/producto coherentes
