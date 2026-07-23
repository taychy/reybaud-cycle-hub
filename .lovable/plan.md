# Sistema de Cargas de Camioneta

Trazabilidad completa desde que la mercadería sale del depósito hasta que llega al cliente, con chequeo manual de contenido de caja y detección de incongruencias.

## Alcance confirmado

- **Solo mercadería con retiro en sede** (KDT, Villa Nueva, u otras sedes). Los envíos a domicilio (correo/moto) quedan fuera de la camioneta pero mantienen su propio circuito de estados.
- Chequeo de caja: **manual, bajo demanda** (botón, sin bloqueo).
- Envíos externos: **estado manual simple** (admin marca "enviado" y "recibido" con campo libre de tracking).
- Alerta de demora: **30 días** en camioneta sin entregar.

## Nuevos estados logísticos unificados

Aplicable a todo pedido físico (delivery items, store_orders, preorders, cambios):

```text
pendiente → preparado → en_camioneta → entregado
                     ↘ enviado (correo/moto) → recibido
                     ↘ retenido (incidencia manual)
```

- El cliente al comprar elige **Modalidad de retiro**: `Sede KDT`, `Sede Villa Nueva`, `Envío a domicilio`.
- Solo las de sede alimentan el pool de "listo para cargar en camioneta".

## Piezas nuevas

### 1. Tabla `vehiculo_cargas`
Representa una salida física de la camioneta.
- Destino (sede), fecha salida, entregador, estado (`abierta` → `en_ruta` → `cerrada`).
- Notas y kilometraje opcional.

### 2. Tabla `vehiculo_carga_items`
- Referencia polimórfica al ítem: `source_table` + `source_id` (delivery_list_item / store_order_item / etc.).
- Snapshot de producto/variante/cantidad/cliente para no depender de la fuente si se edita.
- Estado individual: `cargado`, `entregado`, `retornado`, `faltante`.

### 3. Tabla `vehiculo_chequeos`
Cada vez que depósito toca "Chequear caja".
- Carga asociada, fecha, quién chequeó.
- JSON con resultado por ítem: `presente` / `ausente` / `sobrante`.

### 4. Tabla `logistica_incidencias`
Incongruencias detectadas + acciones manuales tomadas.
- Tipo: `falta_fisica`, `sobrante_fisico`, `demorado_30d`, `envio_sin_confirmar`.
- Estado: `abierta`, `resuelta`, `descartada`.

## Flujos

### A) Armado de carga (depósito)
1. `/deposito/camioneta` → botón "Nueva carga" → elegir sede destino.
2. Pool de candidatos: ítems `preparado` cuya modalidad = esa sede + los que ya están `en_camioneta` de cargas previas de esa sede.
3. Selecciona → pasa a `cargado` en la carga nueva.
4. "Cerrar carga" → estado `en_ruta`, ítems fuente pasan a `en_camioneta`. Genera `stock_movement` de tipo `salida_camioneta`.
5. Reusa la generación de etiquetas QR ya existente.

### B) Entrega en sede (entregador)
- Sigue el flujo actual: escanea QR → marca `entregado`.
- El ítem de la carga refleja `entregado` en tiempo real.

### C) Chequeo de caja (depósito, manual)
1. Botón "Chequear caja" → elige carga activa.
2. Escáner continuo o marcado manual: cada ítem se marca presente/ausente.
3. Al cerrar chequeo, la app cruza:
   - `ausente` + entregador no marcó entregado → **incidencia `falta_fisica`**.
   - `presente` + entregador marcó entregado → **incidencia `sobrante_fisico`**.
   - Ítem `en_camioneta` con >30 días desde salida → **incidencia `demorado_30d`**.
4. Se crea registro en `vehiculo_chequeos` y las incidencias resultantes.

### D) Envíos a domicilio (paralelo a camioneta)
- Admin en el detalle del pedido: botón "Marcar enviado" con campo libre para tracking/observación.
- Botón "Cliente recibió" → estado `recibido`, cierra el circuito.
- Job diario opcional (fase 2): si `enviado` >30 días sin `recibido` → incidencia `envio_sin_confirmar`.

### E) Panel de incidencias (admin)
- `/admin/logistica/incidencias` con filtro por tipo/estado/sede.
- Acciones: marcar entregado retroactivo, reportar pérdida (descuenta stock definitivo), devolver a stock, descartar.
- Widget en dashboard admin: contador de incidencias abiertas.

## Reusa de infraestructura existente

- **QR y escáner**: `CameraScanner.tsx`, `productQr.ts` — sin cambios.
- **Etiquetas**: mismo generador de `DepositoEntregaDetail.tsx`, adaptado para imprimir por carga en vez de por lista.
- **Reconciliación**: patrón similar a `ReconcileWithSupplierDialog.tsx` para el cruce chequeo vs. entregador.
- **Stock movements**: se extiende con nuevos tipos.
- **Sidebar depósito**: se agrega item "Camioneta" entre Entregas y Prov.

## Fases sugeridas de implementación

**Fase 1 — Cimientos** (esta ronda)
- Migraciones: 4 tablas nuevas + campo `modalidad_retiro` en `store_orders` / `delivery_list_items`.
- Pantalla `/deposito/camioneta` con listado, alta y detalle de carga.
- Selección de ítems al armar carga (solo delivery_list_items en esta fase).
- Cierre de carga con generación de estados y stock movements.

**Fase 2 — Chequeo e incidencias**
- Modal de chequeo con escáner/manual.
- Motor de cruce y generación automática de incidencias.
- Panel `/admin/logistica/incidencias`.

**Fase 3 — Envíos externos y expansión**
- Estados de envío en `store_orders` y otras fuentes.
- Sumar `store_orders` y `preorders` al pool de cargas.
- Widget dashboard admin + alertas por email a admin cuando hay >N incidencias abiertas.

## Detalles técnicos

- Referencias polimórficas: `source_table` (`text` con CHECK enum) + `source_id` (`uuid`), sin FK real, se valida por trigger.
- RLS: depósito y admin pueden todo; alumno no ve estas tablas.
- Todas las tablas siguen el patrón `GRANT authenticated + service_role`, RLS enable, políticas por rol.
- Vista `vw_pool_carga_camioneta` que expone ítems candidatos por sede unificando fuentes (fase 1 solo delivery_list_items).
- Actualización de estados por trigger cuando el ítem fuente cambia (ej. entregador marca entregado → se refleja en `vehiculo_carga_items`).

## Decisiones pendientes (te consulto antes de codear la Fase 1)

1. ¿Las sedes son fijas (**KDT** + **Villa Nueva**) o querés que sea una lista editable (tabla `sedes` ya existe — podría reusarse)?
2. En delivery lists actuales que ya están cargadas, ¿asignamos modalidad de retiro por defecto a alguna sede, o quedan sin asignar hasta editar manualmente?
3. Al armar una carga, ¿un ítem puede estar en múltiples cargas simultáneas o forzamos exclusividad (solo una carga activa por ítem)?
