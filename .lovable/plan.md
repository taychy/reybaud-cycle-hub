# Reducción del menú Admin — propuesta por sección

Auditoría de solo lectura sobre `src/pages/admin/AdminLayout.tsx` (estado actual: 34 items visibles, 3 ya ocultos). Ninguna ruta, componente, tabla ni dato se elimina: todo lo propuesto es ocultar del menú o mover el acceso a la pantalla padre.

Evidencia de volumen real (conteo de filas hoy):

| Tabla | Filas |
|---|---|
| store_banners | 0 |
| event_accommodation_waitlist_requests | 1 |
| store_suppliers | 2 |
| waitlist_question_templates | 2 |
| sedes | 4 |
| store_quick_access (pantalla "Promociones") | 5 |
| process_templates / process_instances | 5 / 19 |
| descuentos | 6 |
| store_categories | 9 |
| event_waitlist_entries | 11 |
| email_templates | 12 |

## A) Sacar del menú (sin uso real o casi vacías)

| Item | Ruta | Motivo |
|---|---|---|
| Plantillas waitlist | `/admin/waitlist-plantillas` | 2 plantillas; configuración puntual de Eventos |
| Solicitudes alojamiento | `/admin/solicitudes-alojamiento` | 1 solicitud histórica; el badge puede vivir en Eventos |
| Analytics (Tienda) | `/admin/tienda/analytics` | Duplica lo que ya muestra el Dashboard de Tienda |

## B) Mover a la pantalla padre (dejan de tener entrada propia)

| Item | Ruta | Destino propuesto |
|---|---|---|
| Categorías | `/admin/tienda/categorias` | Pestaña dentro de **Productos** (las categorías ya se consumen ahí en filtro y formulario) |
| Promociones | `/admin/tienda/promociones` | En realidad gestiona *accesos rápidos + destacados* (`store_quick_access`): pestaña dentro del **Dashboard de Tienda**, que ya la enlaza |
| Proveedores | `/admin/tienda/proveedores` | Pestaña dentro de **Pedidos a Proveedor** (2 proveedores) |
| Descuentos | `/admin/descuentos` | Pestaña dentro de **Planes** (6 descuentos, configuración de precios) |
| Precios | `/admin/precios` | Pestaña dentro de **Planes** (mismo objeto de negocio: `planes` + `precio_historial`) |
| Cuenta corriente | `/admin/cuenta-corriente` | Pestaña dentro de **Pagos**; ya se entra por deep-link desde Alumnos y Deudores (`?alumno=`) |
| Plantillas email + Email masivo | `/admin/comunicaciones`, `/admin/email-masivo` | Un solo item **Comunicaciones** con pestañas (WhatsApp / Plantillas / Envío masivo) |
| Procesos | `/admin/procesos` | Ya se accede desde Resumen y desde Programas; dejarlo en **Configuración** en vez de Admisiones |

Solapamiento a revisar antes de tocar: **Cobros de entrega** (`/admin/cobros-entrega`, Finanzas) y **Entregas / Caja** (`/admin/entregas-caja`, Tienda) se referencian mutuamente desde `AdminEntregaDetail`. Propuesta: dejar un único acceso en Tienda → Operación y quitar el de Finanzas, manteniendo el badge de novedad.

## C) Mantener visibles (operación frecuente o crítica)

Academia: Resumen, Métricas (superadmin), Alumnos, Coaches, Solicitudes cambio plan, Eventos, WhatsApp, Entrenamientos, Programas, Turnera.
Finanzas: Pagos, Cierre de caja, Planes, Facturación, Gastos (superadmin).
Tienda: Dashboard, Productos, Stock, Ventas, Pedidos a Proveedor, Control de Mercadería, Entregas / Caja.
Configuración: Sedes, Admins, Historial.

## Resultado

De 34 items visibles a **24**, y con los movimientos de la sección B el menú queda en **~22** entradas reales, sin perder ninguna función.

```text
Academia (10) → Resumen, Métricas, Alumnos, Coaches, Solicitudes cambio plan,
                Eventos, Comunicaciones, Entrenamientos, Programas, Turnera
Finanzas  (5) → Pagos (+Cuenta corriente), Cierre de caja, Planes (+Precios/Descuentos),
                Facturación, Gastos
Tienda    (7) → Dashboard (+Promos/Analytics), Productos (+Categorías), Stock, Ventas,
                Pedidos a Proveedor (+Proveedores), Control de Mercadería, Entregas / Caja
Config    (4) → Sedes, Admins, Historial, Procesos
```

## Orden de ejecución sugerido (cuando lo aprueben)

1. **Riesgo bajo — solo menú**: ocultar los 3 items del grupo A y mover Procesos a Configuración. No requiere tocar ninguna pantalla.
2. **Riesgo bajo — Tienda**: pestañas en Productos (Categorías) y en Dashboard (Promos/Analytics); Proveedores dentro de Pedidos a Proveedor.
3. **Riesgo medio — Comunicaciones**: unificar WhatsApp / Plantillas / Email masivo en una pantalla con pestañas.
4. **Riesgo medio-alto — Finanzas**: Precios y Descuentos como pestañas de Planes, y Cuenta corriente como pestaña de Pagos. Afecta precios y conciliación, así que conviene hacerlo último y verificar los deep-links existentes (`?alumno=`).
5. Definir con vos si Cobros de entrega y Entregas / Caja se unifican en un único acceso.

## Notas técnicas

- Los deep-links actuales que deben seguir funcionando: `/admin/cuenta-corriente?alumno=`, `/admin/whatsapp-conciliador?fecha=&grupo=`, `/admin/facturacion/por-dia`, `/admin/tienda/productos?action=create`, `/admin/procesos/plantillas`.
- `StoreDashboard` enlaza a `/admin/tienda/banners`, que ya está oculto del menú y tiene 0 filas: ese botón queda para revisar en el paso 2.
- Las rutas se conservan todas en `src/App.tsx`; ocultar del menú es reversible en una línea.
