# Cambio de indumentaria

Reglas confirmadas:
- Plazo: 30 días desde entrega.
- Cambio sólo dentro del **mismo producto** (otra talla/color). Si no hay stock → opción "Solicitar devolución" que notifica admin.
- Preventa: puede cambiarse a stock normal **o** a otra variante de la misma preventa si sigue abierta.
- Retiro/entrega: **presencial en sede**.
- Diferencia de precio: pagable desde la app en el momento (MP o efectivo en sede).
- Admin puede iniciar cambio en nombre del alumno (queda registrado `iniciado_por='admin'` + motivo obligatorio).
- Exclusiones por producto: configurables vía flag `no_admite_cambio` en `store_products` (ya existe el patrón).

---

## 1. Base de datos

**Nueva tabla `store_cambios`**
- `id`, `alumno_id`, `producto_id`, `variante_origen` (jsonb {size, color, sku}), `variante_destino` (jsonb)
- `origen_tipo` ('compra' | 'preorder'), `compra_id`, `preorder_id`
- `motivo` (text enum: talle, color, defecto, otro), `comentario`, `fotos` (text[])
- `estado` enum: `solicitado`, `aprobado`, `en_deposito`, `listo_retiro`, `entregado`, `rechazado`, `cancelado`, `devolucion_solicitada`
- `diferencia_precio` numeric, `moneda`, `estado_pago_diferencia` ('no_aplica'|'pendiente'|'pagado'), `mp_payment_id`
- `iniciado_por` ('alumno'|'admin'), `admin_iniciador_id`, `motivo_admin`
- `responsable_admin_id`, `responsable_deposito_id`
- `historial` jsonb[] (cada cambio de estado con autor + timestamp + nota)
- `created_at`, `updated_at`, timestamps por estado
- `notificar_alumno` bool

**Campo nuevo en `store_products`:** `no_admite_cambio bool default false`.

**RLS:**
- Alumno: SELECT/INSERT/UPDATE (cancelar) sólo los propios.
- Admin / depósito: full según rol.
- Trigger `updated_at` + trigger que appendea entrada al `historial` en cada update de estado.

**RPC:**
- `request_cambio_indumentaria(...)` valida ventana 30 días, producto no excluido, variante distinta, sin solicitud abierta.
- `admin_create_cambio_indumentaria(...)` versión admin con motivo.
- `transition_cambio_estado(p_id, p_nuevo_estado, p_nota)` con guardas por rol.

## 2. Edge function

`process-cambio-indumentaria`: maneja pago de diferencia vía MP (crea preference) y aplica cambio de stock cuando depósito confirma.

## 3. Frontend

### Alumno
- En `MisComprasSection`: botón **"Solicitar cambio"** sólo en ítems entregados, dentro de 30 días, sin solicitud abierta y `no_admite_cambio=false`.
- Nuevo componente `RequestCambioDialog.tsx`: 3 pasos (motivo+fotos → nueva variante o "no hay stock → devolución" → confirmar + pago de diferencia si aplica).
- Sub-tab **"Mis cambios"** dentro de Mis Compras con timeline por estado y CTA contextual ("Pagar diferencia", "Retirar en sede").

### Admin
- Nueva sección `/admin/tienda/cambios` con tabs Pendientes / En curso / Cerrados.
- Componentes: `CambiosList.tsx`, `CambioDetailDrawer.tsx`, `AdminCreateCambioDialog.tsx` (selector alumno+compra, motivo obligatorio).
- Acciones: aprobar/rechazar, marcar listo, gestionar devolución.

### Depósito
- En `DepositoLayout` agregar entrada **"Cambios"**.
- Nueva página `DepositoCambios.tsx`: cola de tareas (recibir prenda original + preparar destino), checklist, marcar `listo_retiro`.

### Producto admin
- Toggle "No admite cambio" en `AdminProductForm`.

## 4. Stock

- Al aprobar: reservar variante destino (decremento `variant_stock`).
- Al confirmar entrega en depósito: variante origen vuelve a `disponible` (incremento) salvo que se marque "no reutilizable".
- Si se cancela/rechaza antes de entrega: revertir reserva destino.

## 5. Notificaciones

- Email al alumno en cada cambio de estado relevante (configurable con checkbox por admin).
- Tarea automática para admin si hay solicitud `solicitado` >24h sin atender.

---

## Orden de entrega

1. Migración DB (tabla + flag producto + triggers + RPC).
2. Edge function pago diferencia.
3. UI alumno (botón + dialog + mis cambios).
4. UI admin (sección + crear en nombre del alumno).
5. UI depósito (cola + acciones).
6. Notificaciones email.

¿Avanzo con la migración?
