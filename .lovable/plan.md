
## Objetivo
Que la pestaña **Pedidos** (productos que NO son preventa) tenga el mismo look & feel y las mismas acciones operativas que **Preventas**, pero conservando su lógica de **pago único** (sin seña ni saldo parcial).

---

## 1. Migración de base de datos

Agregar a `store_orders` los campos que hoy solo tiene `store_preorders` para entrega:

```sql
ALTER TABLE public.store_orders
  ADD COLUMN entrega_metodo text,           -- 'retiro_sede' | 'envio_moto'
  ADD COLUMN sede_retiro_id uuid REFERENCES public.sedes(id),
  ADD COLUMN envio_direccion text,
  ADD COLUMN envio_contacto text,
  ADD COLUMN envio_notas text,
  ADD COLUMN envio_costo numeric,
  ADD COLUMN envio_estado text;             -- 'a_cotizar' | 'cotizado' | 'pagado' | 'enviado' | 'entregado'
```

Sin defaults para no tocar pedidos viejos (quedan en NULL → la UI muestra "—").

---

## 2. Rewrite de `src/pages/admin/store/StoreOrders.tsx`

Mismo layout que `StorePreorders.tsx`:

**Header / filtros**
- Título "Pedidos" + botones export (Excel proveedor + PDF resumen).
- Buscador (cliente, #pedido, producto, DNI/teléfono).
- Filtros: Producto, Entrega (Sede/Moto), Estado.
- Chip "Deudores: N (M entregados)" clickeable que filtra deudores.
- Contador "N pedidos" a la derecha.

**Tabla** (mismas columnas que preventas):

| FECHA | CLIENTE | PRODUCTO | CANT. | ENTREGA | TOTAL | PAGO | ESTADO | ACCIONES |

- **Producto**: agrega cantidad de líneas desde `store_order_items` ("2 productos" o nombre único si es uno solo).
- **Entrega**: `Sede` (cyan) / `Moto` (orange) / `—`.
- **PAGO** (pago único, no seña):
  - 🟢 `PAGADO` → `status` en `pagado/preparando/enviado/entregado` y `pagado_at` no null.
  - 🔴 `⚠ DEBE $X` (fila con borde rojo + tinte) → `status = entregado` sin `pagado_at`.
  - 🟡 `PENDIENTE` → resto.
- **ESTADO**: select con `pendiente`, `pendiente_pago`, `pagado`, `preparando`, `enviado`, `entregado`, `cancelado`.
- **ACCIONES**: ✉️ recordatorio, 💬 WhatsApp con link de pago, 🏷️ QR/etiqueta, 👁️ ver detalle, 💲 registrar pago.

**Sheet de detalle** (igual que preventas)
- Cliente (DNI, tel, email).
- Pedido: lista de `store_order_items` con variante, cantidad, precio.
- Entrega: editable (cambiar Sede/Moto, dirección, contacto, notas, costo, estado de envío).
- Pago: botón único "Registrar pago" (abre `ConfirmFullPaymentDialog` con monto total fijo) — sin opción parcial.
- Notas con trazabilidad.

**Acciones que copio 1:1 de preventas**
- `enviarRecordatorio` → reusa edge function o adapta `preorder-payment-reminders` para pedidos (ver punto 4).
- `enviarWhatsApp` → arma link con `/pagar-pedido/:id` (si existe) o `/checkout/:id`. Si no hay flujo público, manda link genérico al perfil del alumno.
- `imprimirEtiqueta` → reusar `printSinglePreorderLabel` con shape adaptado (sin sena/saldo).
- `exportarProveedor` (Excel 2 hojas: resumen por talle + detalle por alumno).
- `exportarPDF` (resumen por talle/variante).
- `exportarOrdenVenta` (PDF individual).

---

## 3. Helper de etiquetas

`src/lib/preorderLabels.ts` ya acepta los campos. Le paso `sena_monto: total`, `saldo_pendiente: 0`, `estado_pago_sena: pagado_at ? 'confirmada' : 'pendiente'` para que la etiqueta funcione sin cambios, o creo `printSingleOrderLabel` espejo que omita la sección de seña.

Decisión: **crear `printSingleOrderLabel`** para mantener limpio.

---

## 4. Recordatorio por email

Hoy `preorder-payment-reminders` es solo para preventas. Opciones:
- (a) Crear edge function `order-payment-reminder` espejo (preferido).
- (b) Agregar a la existente un branch `target: 'order'`.

Voy con (a) para no tocar lo de preventas.

---

## 5. Wrapper `StoreVentas.tsx`

Sin cambios estructurales: ya está la pestaña "Nuevos" + "Pedidos" + "Preventas". La pestaña "Pedidos" pasa a usar el nuevo componente.

La pestaña "Nuevos" hoy reutiliza `StoreOrders` con `restrictStatuses`. **Decisión**: mantener esa prop en el rewrite para no romper "Nuevos".

---

## 6. Lo que NO incluye este plan

- No agrego seña/saldo a pedidos (confirmaste pago único).
- No toco preventas.
- No toco la app del alumno (la vista pública sigue como está).
- La edge function `order-payment-reminder` solo se crea si el template de mail está claro; si no lo está, dejo el botón ✉️ deshabilitado con tooltip y lo activamos en una segunda iteración.

---

## Resumen de cambios

```text
+ supabase/migrations/xxxx_store_orders_entrega.sql
~ src/pages/admin/store/StoreOrders.tsx           (rewrite completo)
+ src/lib/orderLabels.ts                          (espejo de preorderLabels sin seña)
+ supabase/functions/order-payment-reminder/...   (opcional, ver punto 4)
```

Sin cambios en `StoreVentas.tsx`, `StorePreorders.tsx`, ni en el portal del alumno.

¿Avanzo así?
