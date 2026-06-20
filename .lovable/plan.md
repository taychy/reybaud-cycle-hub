# Sistema de cambios de mercadería — rediseño (v2)

## Objetivo
Cubrir las dos rutas de cambio (alumno por app / presencial en depósito) con trazabilidad completa, devolución de stock automática y operación rápida vía **escaneo de QR** con fallback manual.

---

## 1. Elegibilidad y cancelación del pedido

### Solicitar cambio (alumno)
- Habilitado mientras el pedido esté en: `pagado`, `pendiente_pago_efectivo`, `preparando`, `enviado`, `entregado`.
- **Cortado** en: `listo_retiro` (ya está en sede esperándolo), `cancelado`, `devuelto`.
- Motivo: el cambio se puede pedir aunque NO esté pagado todavía (algunos pagan en efectivo al retirar).

### Cancelar pedido (alumno)
- Habilitado hasta `preparando` inclusive.
- **Cortado** desde `listo_retiro` en adelante (ya viajó a sede).

### Forma de pago en efectivo
- Al hacer la compra, el alumno marca `forma_pago = efectivo` y queda en `pendiente_pago_efectivo`.
- Depósito/Sede ve el flag y cobra al entregar.

Validación de ambas reglas en DB (no solo front).

---

## 2. Ruta del cambio — dos orígenes

### Ruta A — Alumno solicita por la app
1. Alumno elige producto y talle/variante de reemplazo → `store_cambios` queda en `solicitado`.
2. Admin aprueba → `aprobado`.
3. Alumno envía la prenda original (sede / camioneta).
4. **Depósito recepciona escaneando QR**:
   - Escanea QR de la prenda **devuelta** → valida que coincide con `variante_origen` del cambio. Estado pasa a `en_deposito`. Stock original suma.
   - Escanea QR de la prenda **de reemplazo** → valida que coincide con `variante_destino`. Stock destino descuenta. Estado pasa a `listo_retiro`.
5. Sede entrega → `entregado`.

### Ruta B — Llegó al depósito sin reclamo previo (presencial)
1. Persona de depósito abre **"Recibir cambio presencial"** y escanea QR de la prenda recibida.
2. Busca la venta original (por nº pedido / alumno / DNI) y la asocia.
3. Define estado del reemplazo:
   - **Solo recepción** → stock vuelve, queda `en_deposito` con `reemplazo_estado = sin_definir`.
   - **Reemplazo definido ahora** → escanea QR del reemplazo → descuenta stock → `listo_retiro`.
   - **Reemplazo pendiente** → queda `en_deposito` con tarea para admin/depósito.
4. Se crea `store_cambios` con `origen = 'presencial'`, `creado_por = deposito_user_id`, vinculado a `store_orders.id`.

---

## 3. Escaneo QR — patrón unificado

### Componente
Reutilizar/extender `src/components/deposito/CameraScanner.tsx`:
- Soporta lectura continua de QR.
- Cada producto/variante tiene un código único ya impreso vía `productLabels.ts` (`PRD-<productId>-<varianteHash>` o similar).
- Helper `decodeProductQr(text)` → `{ producto_id, variante }`.

### Flujo de scan en cambios
- Modal "Escanear" con dos slots: **Devuelve** y **Recibe**.
- Cada slot puede llenarse por:
  - Cámara (preferido) → click "Escanear" → CameraScanner abre.
  - **Carga manual** (fallback) → input con autocomplete de producto + select de variante.
- Validaciones en vivo:
  - Devuelve debe coincidir con `variante_origen` esperada (warning si no, no bloquea — el operador puede forzar).
  - Recibe debe tener stock disponible.
- Confirmar con botón único que dispara la RPC.

### Donde aplica
- Depósito: recepción de cambio (Ruta A paso 4) y recepción presencial (Ruta B).
- Admin: opcional, mismo modal embebido.
- Toda acción de scan queda en `stock_movements` con `cambio_id` y `metodo` (`qr` | `manual`).

---

## 4. Cambios en datos (DB)

Migración única:

### Tabla `store_orders`
- `forma_pago` enum extender: agregar `efectivo`.
- Estado `pendiente_pago_efectivo` agregado al enum de status.

### Tabla `store_cambios`
- `origen_solicitud` enum: `app` | `presencial` (default `app`).
- `recibido_por` uuid, `recibido_en` timestamptz.
- `metodo_recepcion` enum: `qr` | `manual`.
- `metodo_entrega_reemplazo` enum: `qr` | `manual`.
- `reemplazo_estado` enum: `sin_definir` | `pendiente_envio` | `enviado` | `entregado`.
- `producto_reemplazo_id` uuid nullable (por si el reemplazo es OTRO producto, no solo otra variante).
- Trigger:
  - Al pasar a `en_deposito`: devolver stock del producto/variante original.
  - Al confirmar reemplazo: descontar stock destino.
  - Idempotente vía flags `stock_devuelto_at` / `stock_descontado_at`.

### RPCs nuevas
- `deposito_recibir_cambio_qr(cambio_id, qr_devuelto, qr_recibido?, metodo)` — Ruta A.
- `deposito_registrar_cambio_presencial(order_id, qr_devuelto, qr_recibido?, motivo, metodo)` — Ruta B.
- `deposito_definir_reemplazo(cambio_id, qr_o_producto, variante, metodo)`.
- Endurecer `request_cambio_indumentaria`: validar `store_orders.status IN ('pagado','pendiente_pago_efectivo','preparando','enviado','entregado')`.
- `cancel_order(order_id)` para alumno: validar status `≤ preparando`.

---

## 5. UI

### Alumno
- **`MisComprasSection.tsx` / `OrderDetailDialog.tsx`**:
  - Botón "Solicitar cambio" según nuevas reglas.
  - Botón "Cancelar pedido" hasta `preparando`.
- **Checkout**: nueva opción "Pago en efectivo al retirar".
- **`MisCambios.tsx`**: mostrar también cambios `origen = presencial` con estado humanizado.

### Depósito (`/deposito/cambios`)
- Tab **Pendientes app** (lo actual).
- Tab **Recibir presencial** → wizard con escaneo QR.
- Tab **Esperando reemplazo** → cambios `en_deposito` sin reemplazo definido.
- Cada item con botón "Escanear" que abre el modal dual (devuelve / recibe), con fallback manual.

### Admin (`StoreCambios.tsx`)
- Filtro por origen (app / presencial).
- Columna "Reemplazo" con estado.
- Acción "Definir reemplazo" cuando aplique.

---

## 6. Stock — reglas
- Devolver al stock cuando motivo ≠ `defecto`. Defectuosos → bucket "merma" (TODO, se deja flag pero no se implementa ahora).
- Cada movimiento se loguea en `stock_movements` con `tipo = cambio_in` / `cambio_out`, `cambio_id`, `metodo` (`qr` | `manual`), `user_id`.

---

## 7. Archivos a tocar / crear

**Nuevos**
- `src/components/deposito/ScanCambioDialog.tsx` (modal dual devuelve/recibe con cámara + manual).
- `src/components/deposito/RegistrarCambioPresencialDialog.tsx`.
- `src/components/deposito/DefinirReemplazoDialog.tsx`.
- `src/lib/productQr.ts` (encode/decode QR de producto+variante).

**Modificados**
- `src/components/deposito/CameraScanner.tsx` (modo continuo + callback estructurado).
- `src/pages/deposito/DepositoCambios.tsx` (3 tabs + integración scan).
- `src/components/store/MisComprasSection.tsx`, `OrderDetailDialog.tsx`, `RequestCambioDialog.tsx`, `MisCambios.tsx`.
- `src/components/store/BuyProductDialog.tsx` (opción pago en efectivo).
- `src/pages/admin/store/StoreCambios.tsx` (filtros + columna reemplazo).
- `src/pages/admin/store/StoreOrders.tsx` / `StoreVentas.tsx` (mostrar forma de pago + cancelables).

---

## 8. Orden de ejecución

1. Migración DB (enums, columnas, trigger, RPCs, grants) — requiere aprobación.
2. Helper `productQr.ts` + extensión de `CameraScanner` modo dual.
3. `ScanCambioDialog` (componente central reutilizable).
4. Ruta A en depósito (recepción QR del cambio aprobado).
5. Ruta B (wizard presencial).
6. Tab "Esperando reemplazo" + definir reemplazo.
7. Ajustes alumno: elegibilidad cambio, cancelación, opción efectivo.
8. Filtros + columna en admin.

---

## Detalles a confirmar antes de codear

- **QR del producto**: ¿ya están impresos con el formato actual de `productLabels.ts` (variante incluida) o necesitamos rediseñar etiqueta para incluir el código de variante? Esto define si el QR alcanza o necesitamos imprimir etiquetas nuevas por variante.
- **Reemplazo con otro producto distinto** (no solo otra variante del mismo): ¿lo habilitamos desde la app (alumno) o solo desde depósito/admin?
- **Defecto → merma**: ¿lo dejamos como flag para implementar después, o querés que entre en esta tanda?

¿Confirmás este plan v2 y avanzo con la migración?
