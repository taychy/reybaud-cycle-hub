# Auditoría: Pedidos cancelados + Cambios vs Depósito + flujo "prueba"

Sin cambios de código ni de base. Todo lo que sigue está verificado contra el código y los datos reales.

## 1) Pedidos cancelados ensucian la lista

**Cómo se modela hoy**
- La cancelación es un estado más de `store_orders.status = 'cancelado'`, con `cancelled_at` y `cancel_reason` ya existentes.
- Se aplica vía RPC `cancel_store_order(_order_id, _reason)`, que además devuelve stock (queda trazado en `stock_movements` con `reversa_de_movimiento_id`).
- No hay borrado lógico ni columna aparte: la trazabilidad ya está completa.

**Por qué se ve larga la lista**
- Hoy en la base hay 27 pedidos: **14 cancelados**, 11 entregados, 2 en camioneta. O sea, más de la mitad de la tabla es ruido (varios son reintentos de checkout del mismo alumno el mismo día).
- `StoreOrders.tsx` filtra en cliente (`filtered`): sin `restrictStatuses`, el filtro de estado arranca en `"all"` y `"all"` incluye cancelados. La pestaña "Nuevos" sí los excluye porque pasa `restrictStatuses`.

**Propuesta (bajo riesgo, sólo frontend)**
- Cambiar el selector de estado de la pestaña "Pedidos" para que el valor por defecto sea **"Activos"** (todos menos `cancelado`), y agregar las opciones **"Cancelados"** y **"Todos"** además de los estados individuales.
- Mostrar junto al contador un chip discreto: `14 cancelados ocultos` que al tocarlo cambia el filtro a "Cancelados". Nada se borra ni se archiva.
- Sin migración, sin tocar el RPC de anulación, sin perder historial.

## 2) Por qué Admin > Cambios y Depósito > Cambios no muestran lo mismo

Las dos vistas leen la **misma tabla** (`store_cambios`) pero con filtros distintos:

| | Admin (`StoreCambios.tsx`) | Depósito (`DepositoCambios.tsx`) |
|---|---|---|
| Query | `select *` sin filtro de estado | `.in('estado', ['aprobado','en_deposito','listo_retiro'])` |
| Buckets | Nuevos (`solicitado`, `devolucion_solicitada`) / Seguimiento (`aprobado`, `en_deposito`, `listo_retiro`) / Cerrados (`entregado`, `rechazado`, `cancelado`) | Pendientes (`aprobado`) / Esperando reemplazo (`en_deposito` y `reemplazo_estado` ≠ enviado/entregado) / Listos (`listo_retiro`) |
| Filtro extra | Origen app/presencial | ninguno |

Consecuencias reales:
- Depósito **nunca ve** `solicitado` ni `devolucion_solicitada` (falta aprobación admin) ni los cerrados. Ejemplo actual: la solicitud de Jessica Carolina Gonzalez (`solicitado`) sólo existe en Admin.
- Un cambio en `en_deposito` con reemplazo ya `enviado/entregado` desaparece de Depósito pero sigue en "Seguimiento" de Admin.
- No es un bug de datos ni de RLS (admin y depósito tienen políticas `ALL` sobre la tabla): es diferencia de criterio de filtrado. Propongo unificar el vocabulario de estados en pantalla y agregar en Depósito una pestaña de sólo lectura "Cerrados / histórico" para que ambos hablen del mismo universo.

## 3) El caso Alejandro Najmanovich y la prenda "de prueba"

**Qué hay en datos**
- Pedido #19 (04/08, entregado): Chaleco Rompeviento Santini, Talle L, 1 unidad.
- `store_cambios` id `69bfe3c2…` creado 11/08 por depósito: `motivo = talle`, comentario *"Solo recibir y controlar. no hay stock para cambios, hay que cargar en stock."*, `variante_origen = {}`, **`variante_destino = null`**, `reemplazo_estado = 'sin_definir'`, estado `en_deposito`.
- Movimiento asociado: `stock_movements` tipo `ingreso`, motivo `cambio_in`, 1 unidad de Chaleco Santini el 11/08 18:21 (`stock_devuelto_at` de ese cambio).

**Por qué "cae en Cambios"**
Hoy **no existe ningún otro registro posible**: la única forma que tienen admin y depósito de recibir una prenda de vuelta es crear un `store_cambios`. Como nunca hubo prenda de reemplazo, el registro queda con destino nulo y se congela para siempre en "Esperando reemplazo" (Depósito) / "En seguimiento" (Admin). Es una devolución de prueba disfrazada de cambio incompleto.

**Propuesta de modelo (aditiva, reutiliza todo lo existente)**

Agregar a `store_cambios` un discriminador en vez de crear un sistema paralelo:

```text
store_cambios.tipo  text  default 'cambio'
   'cambio'     -> cambio real de una prenda comprada (flujo actual, sin tocar)
   'devolucion' -> devolución/anulación de una compra (sin reemplazo)
   'prueba'     -> prenda enviada a prueba, no vendida
store_cambios.prueba_resultado  text  null
   null | 'pendiente' | 'devuelta' | 'convertida_en_venta'
```

Ciclo de vida de una prueba, mapeado sobre los estados que ya existen (no se agregan valores al enum `cambio_estado`):

```text
prueba enviada     -> tipo='prueba', estado='listo_retiro', prueba_resultado='pendiente'
                      (egreso de stock con motivo 'prueba_out', NO es venta)
devuelta sin compra-> estado='entregado' + prueba_resultado='devuelta'
                      (ingreso 'prueba_in', prenda original intacta, sin factura)
se la queda        -> prueba_resultado='convertida_en_venta' + order_id del pedido nuevo
                      (no se re-descuenta stock: el egreso de la prueba se reusa)
```

Reglas clave:
- Una prueba **nunca** toca la prenda original comprada ni genera `store_cambios` de tipo `cambio`.
- Contablemente sólo hay venta si se convierte; ahí se crea un `store_orders` normal con el flujo existente y se enlaza por `order_id`.
- Movimientos de stock con motivo propio (`prueba_out` / `prueba_in`) para que el detector de inconsistencias no los lea como ventas.

**UX propuesta**
- Admin > Ventas > Cambios pasa a llamarse **"Cambios y pruebas"** con filtro de tipo: `Cambios | Devoluciones | Pruebas | Todos`. Por defecto sólo cambios + devoluciones.
- Depósito > Cambios suma pestaña **"Pruebas afuera"** (lo que está en la calle esperando volver) con dos botones por ítem: *Devuelta* y *Se la quedó → generar venta*.
- El registro presencial de depósito arranca con la pregunta simple: **"¿Qué está pasando?" → Cambia una prenda / Devuelve una compra / Envío a prueba / Vuelve una prueba**. Eso es lo que hoy falta y obliga a forzar todo a "cambio".

**Migración del caso real**: el registro de Najmanovich se reclasifica manualmente a `tipo='prueba'`, `prueba_resultado='devuelta'`, estado `entregado`. El ingreso de stock ya existente queda como está (sólo se corrige el motivo si querés), así que no hay impacto contable.

## Riesgos y alcance
- Punto 1: sólo frontend, riesgo nulo.
- Punto 2: unificación de etiquetas + pestaña histórica en Depósito, sin cambios de datos.
- Punto 3: migración aditiva (2 columnas nullable con default) + adaptaciones de UI y de los RPC `deposito_registrar_cambio_presencial` / `deposito_recibir_cambio` para aceptar el tipo. No rompe registros existentes, que quedan todos como `tipo='cambio'`.

## Qué necesito confirmar antes de implementar
1. ¿Avanzo con los tres puntos en una sola tanda, o primero el 1 y 2 (rápidos, sin migración) y el 3 aparte?
2. Para "prueba convertida en venta": ¿el precio sale del catálogo actual o admin lo define a mano al convertir?
