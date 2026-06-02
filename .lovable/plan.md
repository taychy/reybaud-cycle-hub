## Objetivo

1. **Eliminar el rol "Soporte"** del sistema (los admins existentes con rol `support` se borran de `admin_profiles` y pierden acceso al panel admin).
2. **Unificar la gestión de Depósito** dentro de `/admin/admins`: al invitar se puede elegir rol `super_admin`, `admin` o `deposito`, y los usuarios depósito aparecen en la misma tabla.
3. **Acceso del rol Depósito**: al entrar al panel solo ve las opciones del menú **Tienda** (Dashboard, Productos, Categorías, Pedidos, Preventas, Promociones, Banners, Stock, Analytics).

---

## Cambios

### 1. Base de datos (migration)
- Agregar `'deposito'` al enum `admin_role`.
- Borrar las filas de `admin_profiles` con `role = 'support'` y sus entradas en `user_roles` con `role = 'admin'` (revoca acceso admin a quienes eran Soporte; el usuario auth queda, pueden re-invitarse).
- Dejar el valor `'support'` en el enum (Postgres no lo elimina fácil) pero la UI ya no lo expone.

### 2. Edge function `invite-admin`
- Aceptar `role ∈ {super_admin, admin, deposito}` (sacar `support`).
- Si `role = 'deposito'`:
  - Crear/actualizar `admin_profiles` con `role='deposito'`.
  - Asignar `user_roles` con `role='deposito'` (no `'admin'`).
  - Crear/actualizar `deposito_profiles` con `estado='activo'` para mantener compatibilidad con el flujo actual de stock.
- Si `role ∈ {super_admin, admin}`: igual que hoy (`user_roles.role='admin'`).

### 3. Frontend `ManageAdmins.tsx`
- `ROLE_LABELS`: sacar `support`, agregar `deposito: "Depósito"`.
- `Select` de rol (crear y editar): opciones Super Admin / Admin / Depósito.
- Tipos: `role: "super_admin" | "admin" | "deposito"`.
- Al editar un usuario y cambiarle el rol entre admin↔deposito, mover su entrada en `user_roles` correspondiente (RPC o doble update).

### 4. `AdminLayout.tsx` (acceso y sidebar)
- Cambiar el check inicial: aceptar entrada si el user tiene `admin` **o** `deposito`.
- Cargar `admin_profiles.role` y guardarlo en estado.
- Sidebar:
  - Si `role === 'deposito'`: mostrar **solo** la sección "Tienda" (ocultar Principal, Finanzas, Configuración, y los items Métricas/Gastos de super admin).
  - Si entra a `/admin` sin sub-ruta y es deposito, redirigir a `/admin/tienda`.

### 5. `App.tsx` (route guard)
- Cambiar `<Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}>...}` a `allowedRoles={["admin", "deposito"]}`.
- Para que un deposito no pueda abrir rutas no-Tienda por URL directa: dejar que `AdminLayout` haga un `Navigate` a `/admin/tienda` si el `pathname` no empieza con `/admin/tienda` y `role === 'deposito'`. Opción simple y suficiente para este caso.

### 6. Limpieza menor
- Item del sidebar "Depósito" (`/admin/deposito` → `ManageDeposito`) queda como Configuración para super admin/admin (gestionar quién es deposito) — pero como ahora se administra desde `/admin/admins`, ocultar ese item. La pantalla `ManageDeposito` y la ruta `/deposito` standalone quedan como están (no se tocan).

---

## Archivos afectados

- **Nueva migration** (enum + cleanup).
- `supabase/functions/invite-admin/index.ts`
- `src/pages/admin/ManageAdmins.tsx`
- `src/pages/admin/AdminLayout.tsx`
- `src/App.tsx` (un solo `allowedRoles`)

---

## Fuera de alcance

- No se modifica el portal standalone `/deposito` (sigue funcionando).
- No se eliminan las pantallas `ManageDeposito` ni `invite-deposito` (quedan inutilizadas pero no rompen nada).
- No se hace migración de UI para el badge "Contraseña pendiente" (se mantiene tal cual).

¿Avanzo con esto?