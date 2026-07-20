
# Caja de Entregas + Alerta en Dashboard Admin

## Modelo elegido (según tus respuestas)

- **Una caja por `delivery_list`**: se abre al crear la lista, se cierra cuando el operador termina de entregar/cobrar. Contabilidad atada al lote (ej: "Santini Invierno").
- **Cobros entran directo a la caja** al informarlos el entregador (sin fricción). Admin ve alerta pero no bloquea.
- **Cierre exportable** con totales por moneda × método, ítems no entregados y PDF.
- **Dashboard admin**: widget "Tienda / Entregas" con cobros sin validar, entregas pendientes, total cobrado (caja abierta), estado de caja, **costo de mercadería, pagos a proveedor, total por cobrar**.

## Cambios de base de datos

### 1. Ampliar `delivery_lists`
Nuevos campos para la contabilidad del lote:
- `caja_estado` (enum: `abierta` | `cerrada`) — por defecto `abierta` al crear la lista.
- `caja_abierta_at`, `caja_abierta_por`, `caja_cerrada_at`, `caja_cerrada_por`.
- `costo_total_mercaderia` (numeric) — cuánto costó comprar toda la mercadería al proveedor.
- `pagado_a_proveedor` (numeric) — cuánto ya se le pagó al proveedor.
- `moneda_costo` (text, default 'ARS') — moneda del costo.
- `notas_cierre` (text).

### 2. Ampliar `delivery_list_items`
Para el "total por cobrar" y costo unitario:
- `costo_unitario` (numeric) — costo del ítem al proveedor.
- `precio_venta` (numeric) — precio de venta al cliente (ya existe si guardamos precio; verificamos).

### 3. Nueva tabla `delivery_supplier_payments`
Registra pagos parciales al proveedor por lista:
- `delivery_list_id`, `monto`, `moneda`, `metodo` (efectivo/transferencia/MP/otro), `fecha`, `notas`, `comprobante_url`, `registrado_por`.

### 4. Vista `delivery_list_summary`
Vista materializada/función que devuelve por lista:
- Total esperado a cobrar (Σ `precio_venta` × cantidad de ítems entregados o todos)
- Total cobrado (Σ `delivery_list_payments` validados o todos según método)
- Total pendiente = esperado − cobrado
- Costo mercadería, pagado a proveedor, saldo a proveedor
- Margen bruto = cobrado − costo
- Ítems entregados vs pendientes

## Backend

### RPCs / triggers
- `close_delivery_cash(delivery_list_id)` — cierra la caja, valida que no queden cobros pendientes de validación crítica y genera snapshot final.
- `reopen_delivery_cash(delivery_list_id)` — solo super admin, para corrección.
- Trigger que impide registrar cobros/pagos si `caja_estado = 'cerrada'`.

### Edge function `import-delivery-costs`
Importa el Excel de costos del proveedor:
- Recibe archivo XLSX con columnas producto/cantidad/costo unitario/costo total.
- Matchea por SKU/nombre contra `delivery_list_items` de una lista específica.
- Actualiza `costo_unitario` y agrega/actualiza `costo_total_mercaderia`.
- Opcionalmente registra el primer pago al proveedor si se indica.

## Frontend

### Nueva sección Admin → Tienda → "Entregas / Caja"
Ruta: `/admin/entregas-caja`
- Lista de todas las `delivery_lists` con estado de caja (abierta/cerrada), totales resumidos, badge de alertas.
- Detalle por lista con 4 tabs:
  1. **Ítems y entregas** (lo que ya existe).
  2. **Cobros** (con validación admin de comprobantes; entra directo a la caja).
  3. **Costos y proveedor** — costo de mercadería, importar Excel, pagos al proveedor, saldo.
  4. **Cierre** — resumen final, botón "Cerrar caja", PDF exportable.

### Widget en `AdminDashboard`
Nuevo card "Tienda / Entregas":
- Cobros sin validar (N) → link a validación.
- Listas con caja abierta (N).
- Total cobrado hoy por moneda (todas las cajas abiertas).
- Total por cobrar (esperado − cobrado) de listas activas.
- Costo mercadería no pagada a proveedor.
- Botón "Ver detalles".

### Sidebar admin
Agregar item "Entregas / Caja" dentro de categoría "Tienda".

## Sobre el Excel adjunto

Mencionás que adjuntaste un archivo con costo de mercadería y pagos a proveedor, **pero no lo veo cargado en este mensaje**. Cuando aprobés el plan, adjuntalo en el siguiente mensaje y lo proceso para:
1. Crear la primera "Lista de entrega" con costos ya cargados, o
2. Actualizar la lista "Santini Invierno" existente con los costos importados.

## Detalles técnicos

- Todas las tablas nuevas con RLS, GRANT para `authenticated` y `service_role`.
- Políticas: admin/super_admin ven todo; deposito ve/modifica su lista; alumno solo su propio cobro (ya existe).
- El widget consulta la vista `delivery_list_summary` con caching de 60s.
- PDF de cierre: generado client-side con jsPDF (ya usado en otros cierres).
- Cierre de caja emite evento a `admin_notification_events` para trazabilidad.

## Orden de implementación

1. Migración DB (tablas, vista, triggers, RLS).
2. Sección Admin `/admin/entregas-caja` con los 4 tabs.
3. Widget dashboard + item sidebar.
4. Edge function import-delivery-costs.
5. PDF de cierre.
6. Procesar Excel adjunto (después de que lo mandes).
