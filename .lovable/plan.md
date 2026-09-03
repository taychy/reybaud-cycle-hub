# Auditoría Tienda · Cancelados, Cambios Admin/Depósito y Prendas de prueba

Auditoría de solo lectura (código actual, RPCs/triggers actuales en DB, y el registro real de Alejandro). No se modificó nada.

## Resultado por punto

**(1) Ocultar cancelados por defecto — HECHO**
`src/pages/admin/store/StoreOrders.tsx`: filtro por defecto `activos` (línea 174 y 338-340), opciones `Activos (sin cancelados)` / `Todos los estados` / `Cancelados` (701-703) y aviso "N cancelados ocultos" con acceso directo (723-730). No se borra nada: trazabilidad intacta.

**(2) Alinear Cambios Admin/Depósito + histórico — HECHO**
Ambas vistas leen `store_cambios` y comparten el lenguaje de `src/lib/cambios.ts` y `src/lib/pruebas.ts`.
- Admin `StoreCambios.tsx`: pestañas Nuevos / Seguimiento / Pruebas / Cerrados.
- Depósito `DepositoCambios.tsx`: Pendientes / Esperando / Listos / En prueba / Cerrados (incluye pruebas cerradas en el histórico).

**(3) Flujo de Prendas de prueba — PARCIAL (una invariante falla)**
- Alta desde Admin: detalle de pedido en `StoreOrders.tsx:1029` (`PruebasSection` con botón "Agregar prenda de prueba").
- Alta desde Depósito: detalle de pedido en `DepositoPedidos.tsx:433` (mismo componente, no `readOnly`).
- Seguimiento de pruebas afuera: `PruebasSection` + pestaña "En prueba" de Depósito, con días afuera y semáforo (`src/lib/pruebas.ts`).
- Acciones: devolver / se la quedó / usar como cambio disponibles en Admin; en Depósito, sólo devolver.

## Invariantes de stock (verificadas contra las funciones reales en DB)

| Invariante | Estado | Evidencia |
|---|---|---|
| Crear prueba descuenta `prueba_out` exactamente 1 vez | OK a nivel llamada | `crear_prenda_prueba` hace un único `adjust_store_stock(-1)`. **No hay guarda de idempotencia**: dos submits crean dos pruebas y dos egresos (sólo lo evita el `disabled` del botón). |
| `prueba_devolver` suma `prueba_in` exactamente 1 vez | OK | `FOR UPDATE` + `IF prueba_resultado <> 'pendiente' THEN RAISE` + `IF stock_devuelto_at IS NOT NULL THEN RAISE`. El segundo intento falla, no suma. |
| `prueba_convertir_en_venta` NO genera segundo descuento | OK | Sólo inserta `store_order_items`, suma al total y cierra la prueba. No toca stock. |
| `prueba_usar_como_cambio` no debe reingresar la prenda de prueba | **FALLA** | La RPC hace `UPDATE ... estado='en_deposito', reemplazo_estado='entregado', motivo='talle'`. El trigger `store_cambios_apply_stock` (BEFORE UPDATE) dispara `cambio_in +1` sobre `producto_id` porque `estado='en_deposito'`, `stock_devuelto_at IS NULL` y `motivo <> 'defecto'`. Resultado: **suma stock de la prenda que quedó con el alumno**, y no registra el ingreso de la prenda originalmente comprada que vuelve. El `cambio_out` no se duplica porque `stock_descontado_at` ya viene seteado. |

## Caso Alejandro Najmanovich

`store_cambios 69bfe3c2-8ad5-420d-a2a7-e5630ed7506b`: `tipo='prueba'`, `prueba_resultado='devuelta'`, `estado='entregado'`, `prueba_salida_at=2026-08-11 18:20`, `prueba_cierre_at=2026-08-31 19:31`, `stock_devuelto_at=2026-08-11 18:21`.
Movimientos de stock asociados: **uno solo**, `ingreso / cambio_in / cantidad 1` del 2026-08-11 18:21 (previo a la reclasificación). La reclasificación **no generó movimientos extra**. Total en la tabla: 1 prueba (esta) y 6 cambios reales.

## Migraciones y tests

- Migración del alcance: `supabase/migrations/20260831192509_565c5d1e-4754-4f5e-9261-5589a865b291.sql` (campos `tipo`, `prueba_resultado`, `prueba_salida_at`, `prueba_cierre_at`, `prueba_order_item_id` + las 4 RPCs). Complementarias del mismo día: `20260831155023...`.
- Tests: `src/lib/pruebas.test.ts` (13 casos) cubre **sólo clasificación, etiquetas, días afuera y separación de universos**. **Ninguna invariante de stock ni de RPC está cubierta.** `supabase/tests/store_stock_regression.sql` cubre ventas/cancelaciones, no pruebas.
- Sí hubo turno final con typecheck + tests (247) + build para este alcance; sin publicar.

## Conclusión

**NO se puede dar por 100% completado.** Los puntos 1 y 2 están completos. El punto 3 está implementado de punta a punta salvo una invariante contable: `prueba_usar_como_cambio` produce un `cambio_in` incorrecto sobre la prenda de prueba y no modela el retorno de la prenda comprada. Además falta cobertura de tests sobre stock y no hay guarda de doble submit en el alta.

## Corrección mínima propuesta (no ejecutada)

1. Nueva migración: `prueba_usar_como_cambio` no debe pasar por `estado='en_deposito'`. Convertir la prueba en cambio dejándola en `listo_retiro`/`entregado` con `stock_devuelto_at` ya seteado (para neutralizar el bloque 1 del trigger) y registrar aparte, cuando llegue, el ingreso de la prenda original devuelta — idealmente pidiendo producto/variante original en la propia RPC.
2. Guarda de idempotencia en `crear_prenda_prueba` (índice único parcial por `order_id + producto_id + variante + resultado pendiente`, o clave de idempotencia).
3. Tests SQL de regresión de stock para las 4 RPCs, en la línea de `store_stock_regression.sql`.
