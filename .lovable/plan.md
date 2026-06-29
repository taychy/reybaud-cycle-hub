# Pedidos a Proveedor + Ingreso de mercadería con chequeo ítem por ítem

## 1. Base de datos (migración)

Dos tablas nuevas en `public`:

- `supplier_orders`
  - `id`, `numero` (autoincremental visible, ej. `PP-0001`), `proveedor_nombre` (texto), `proveedor_contacto` (texto, opcional)
  - `fecha_pedido` (date), `fecha_estimada_entrega` (date, opcional)
  - `estado`: `abierto` | `recibido_parcial` | `cerrado` | `cancelado`
  - `notas` (texto), `total_estimado` (numeric), `moneda` (text, default ARS)
  - `created_by`, `created_at`, `updated_at`
- `supplier_order_items`
  - `id`, `supplier_order_id` (FK cascade)
  - `product_id` (FK opcional a `store_products`, nullable para items sueltos)
  - `producto_nombre` (texto — snapshot), `variante` (jsonb, ej. `{talle, color}`)
  - `cantidad_pedida` (int), `cantidad_recibida` (int default 0)
  - `precio_unitario` (numeric, opcional)
  - `notas` (texto)

RLS + GRANTS:
- `authenticated` puede SELECT/INSERT/UPDATE/DELETE si es `admin`, `super_admin`, `support` o `deposito` (vía `has_role`).
- `service_role` ALL.
- Trigger `update_updated_at`.

## 2. Módulo "Pedidos a Proveedor"

Página única reutilizable, accesible desde:
- **Admin** → menú lateral "Tienda" → "Pedidos a Proveedor" (`/admin/tienda/pedidos-proveedor`)
- **Depósito** → menú lateral "Pedidos a Proveedor" (`/deposito/pedidos-proveedor`)

UI:
- Listado con filtros por estado y búsqueda por proveedor / número.
- Botón "Nuevo pedido": dialog con datos de cabecera + tabla de ítems (autocomplete contra `store_products` con sus variantes, o ítem libre).
- Editar pedido: misma dialog.
- Acciones: "Marcar como cerrado", "Cancelar".
- En cada fila, badge de estado y conteo `recibidos/pedidos`.

## 3. Ingreso de mercadería (runner)

Cuando la plantilla de proceso es "Ingreso de mercadería" (detectada por nombre, ej. `/ingreso.*mercader/i`):

**Etapa 1 — Recepción** (queda como hoy: foto + nota).

**Etapa 2 — Control contra pedido** (renderiza componente especializado `SupplierOrderCheckStage`):
- Dropdown: pedidos a proveedor con estado `abierto` o `recibido_parcial` (formato: `PP-0023 · Proveedor X · 15/06`).
- Al elegir uno, se listan sus ítems con: nombre + variante, cantidad pedida, input de cantidad recibida (precargado con `cantidad_recibida` previa), badge `✓ / ! / —`.
- Botón "Confirmar etapa" que:
  - Actualiza `cantidad_recibida` de cada item.
  - Si todos los items quedan `recibida >= pedida` → `supplier_orders.estado = 'cerrado'`; si hay algunos parciales → `recibido_parcial`.
  - Guarda en la etapa: `entidad_ref_id = supplier_order_id`, `nota = resumen (ok / faltantes / sobrantes)`.

**Etapa 3 — Reporte y cierre** (genérico, se mantiene; `accion_final = send_report` ya envía mail con todas las etapas).

## 4. Datos de seed / plantilla

Si la plantilla "Ingreso de mercadería" no existe aún en la DB, la creo en la migración con 3 etapas:
1. Recepción (requiere_foto + requiere_nota opcional)
2. Control contra pedido (`entidad_control = supplier_order`)
3. Reporte y cierre (`accion_final = send_report`)

## 5. Detalles técnicos

- Rutas nuevas en `src/App.tsx` y entradas en sidebars (`AdminLayout` y `DepositoLayout`).
- Hook `useSupplierOrders` para listar/crear/actualizar.
- Componente `SupplierOrdersAdmin.tsx` (página compartida) + `SupplierOrderDialog.tsx`.
- Componente `SupplierOrderCheckStage.tsx` para la etapa 2 del runner.
- Tipos en `src/integrations/supabase/types.ts` se regeneran tras la migración.

## 6. Fuera de alcance

- Importar pedidos a proveedor desde CSV (se puede agregar después).
- Notificaciones automáticas al proveedor.
- Integración con stock (sumar al stock real al recibir) — se puede agregar luego como acción opcional.

¿Confirmás avanzar así?
