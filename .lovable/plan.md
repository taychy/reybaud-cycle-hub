# Caso Ale Goro → Gastón Fernández: diagnóstico y plan mínimo

## Qué encontré en los datos reales

La campera no es una orden ni una preventa de Tienda: no existe ninguna fila en `store_orders` ni en `store_preorders` a nombre de Ale Goro. El caso vive en la **lista de entrega** "Santini de invierno 26":

- Ítem `432bbf91…`: producto "Campera Reybaud Santini", talle L, USD 180.
- `cliente_nombre = "Ale Goro"` (el encabezado que ves).
- `alumno_id = Gastón Fernández` (la fila vinculada con su email).
- `cliente_alumno_id` sigue vacío.
- No hay cobros cargados para ese cliente en la lista.

En la cuenta corriente de Gastón el cargo **sí aparece hoy en preview**: "Entrega — Santini de invierno 26 — Campera Reybaud Santini (L), USD 180". Eso ya lo resolvió el bloque de entregas que hicimos antes; lo que todavía no está publicado a producción es lo que estás mirando.

## Causa estructural de cada problema

**1) El encabezado sigue diciendo "Ale Goro".**
El nombre visible sale del campo de texto `cliente_nombre` guardado en el ítem, mientras que "vincular alumno" escribe únicamente `alumno_id`. Son dos campos independientes: vincular no renombra. El botón "Vincular alumno" (`DeliveryClientNotify`) no toca el nombre; el que sí lo hace es la reasignación de comprador (`ReassignBuyerDialog` → función `reasignar_comprador_entrega`), que está sólo en la pantalla de admin de la entrega, no en la de depósito ni en la fila de vínculo.

**2) "Vincular" no siempre lleva la compra a la cuenta corriente.**
La cuenta corriente arma los movimientos exclusivamente por `alumno_id`:
- cargos de entrega: por `delivery_list_items.alumno_id` y con precio > 0;
- cobros de entrega: por `delivery_list_payments.alumno_id`, y sólo si están validados.

Vincular actualiza los ítems pero **no los cobros**, así que un pago cargado a nombre del cliente anterior queda sin dueño y nunca aparece en la cuenta del nuevo. En este caso puntual no hay cobros, por eso el cargo se ve y el pago no existe. Además el cargo sólo entra si el ítem no proviene de una orden/preventa de Tienda (para no duplicar con el cargo de Tienda).

**3) El botón de detalle sólo aparecía en algunos movimientos.**
En el código actual el detalle está habilitado para **todos** los movimientos; lo que cambia por tipo son las acciones extra (aplicar crédito, cambiar plan, anular). La diferencia que ves es porque esa mejora está en preview y no en producción.

## Plan mínimo propuesto (sin implementar aún)

1. **Un solo camino para "cambiar de comprador".** Reemplazar el vínculo suelto por la reasignación completa en las dos pantallas (admin y depósito): elegir alumno actualiza a la vez responsable económico y nombre visible, y deja registro en auditoría del comprador anterior. El botón de "sólo vincular" se retira para evitar el estado híbrido nombre-viejo / alumno-nuevo.
2. **Arrastrar los cobros cuando corresponda.** Al reasignar, si el comprador anterior tenía cobros en esa lista, ofrecer explícitamente qué hacer con cada uno: dejarlos donde están (si el dinero fue de la otra persona) o moverlos al nuevo comprador. Nunca mover en silencio.
3. **Mostrar en pantalla el estado real.** En la ficha del cliente de la entrega, mostrar el nombre y, debajo, a quién se le imputa económicamente; si difieren, un aviso "el cargo se imputa a X".
4. **Cerrar este caso desde la pantalla**, no por base de datos: reasignar el ítem de la campera a Gastón para que el encabezado también cambie. El historial de Ale queda en la auditoría.
5. **Publicar.** Buena parte de lo que falta (detalle universal en cuenta corriente, cargo de entrega visible) ya está resuelto en preview; hace falta publicar para que lo veas en producción.

## Detalles técnicos

- Pantallas: `src/pages/admin/AdminEntregaDetail.tsx`, `src/pages/deposito/DepositoEntregaDetail.tsx`, `src/components/deposito/DeliveryClientNotify.tsx`, `src/components/deposito/ReassignBuyerDialog.tsx`.
- Tablas: `delivery_list_items` (`cliente_nombre`, `alumno_id`, `cliente_alumno_id`, `source_type`), `delivery_list_payments` (`cliente_nombre`, `alumno_id`, `validado`).
- Vista: `vw_cuenta_corriente_movimientos`, ramas `cargo_entrega` y `pago_entrega` (join por `alumno_id`).
- Función existente: `reasignar_comprador_entrega(item, alumno, nombre)` — hoy actualiza sólo el ítem y audita; habría que extenderla con un parámetro opcional para reasignar cobros seleccionados.
- Cuenta corriente: `src/components/admin/StudentCuentaCorrienteSection.tsx` (detalle ya universal).
- Sin borrado de historial: todo por actualización + `audit_log`.
