# Auditoría funcional Reybaud — mapa por dominios y núcleo mínimo

Solo lectura. No se editó código, DB, cron ni datos.

Base de evidencia: `src/App.tsx` (rutas), `src/pages/admin/AdminLayout.tsx:21-149` (sidebar), `src/components/BottomNav.tsx`, `src/pages/deposito/DepositoLayout.tsx:10-21`, 99 edge functions, 512 migraciones, ~126.700 líneas en `src/pages` + `src/components`.

Escala actual: **~75 rutas admin**, 10 rutas coach, 15 depósito, ~30 públicas, 8 alumno.

## Hallazgos transversales

- **~24 rutas admin existen pero no están en el sidebar** (solo por URL): `whatsapp-historial`, `deposito`, `centro-control`, `gestion-redes`, `bajas`, `aprobar-aviso-precio`, `cambios-paquete`, `procesos/plantillas`, `tienda/incidentes-escaneo`, las 4 páginas `*/por-dia`, `chequeo-alumnos`, detalles (`programas/:id`, `entregas/:id`, `eventos/:id/lista-espera`), `planes/:planId/playbook`.
- **Rutas duplicadas exactas**: `entregas` = `entregas-caja` (App.tsx:226-227); `eventos/participantes` = `eventos/record-de-la-hora/participantes` (237-238); `procesos/runner/:id` = `programas/:id/flujo/:id` (234, 280).
- **Portal coach sin layout propio** (existen `AdminLayout` y `DepositoLayout`, no `CoachLayout`): navegación por botones en `CoachDashboard.tsx:98-103`.
- **15 edge functions sin referencia** en `src/` ni en otras functions ni en crons de migraciones: `admin-ai-assistant`, `cleanup-pending-subscriptions`, `expire-programa-cuota2`, `notify-students-incomplete-data`, `preview-transactional-email`, `process-auto-renewals`, `process-installment-reminders`, `process-pausa-expirations`, `process-turnera-reminders`, `register-whatsapp-contact`, `renew-monthly-subscriptions`, `send-monthly-plan-changes-reminder`, `send-trip-config-reminder`, más `mp-gastos-webhook` y `handle-email-suppression` (probables webhooks externos). Varias sostienen procesos críticos (renovaciones, pausas, recordatorios) presumiblemente agendadas fuera de migraciones: **verificar antes de tocar, no archivar por ausencia de referencia**.

## Mapa por dominio

| Dominio | Pantallas clave (visibilidad) | Solapamientos / complejidad | Backend (inventario) | Propuesta | Riesgo |
|---|---|---|---|---|---|
| **Alumnos** | `alumnos` (sidebar), `alumnos/nuevos-por-dia`, `chequeo-alumnos`, `bajas`, `ver-como/:id` (URL) | `ManageStudents.tsx` **2081 líneas** con ficha + tabs; `chequeo-alumnos` duplicado coach/admin vía prop `adminMode` | `alumnos`, `alumno_email_links`, `merge_alumnos`, `resolve_alumno_for_enrollment` | SIMPLIFICAR (partir ficha en secciones) | Medio |
| **Suscripciones/Planes** | `planes`, `precios`, `descuentos`, `solicitudes-cambio-plan`, `aprobar-aviso-precio` (URL), `planes/:id/playbook` (URL) | 4 pantallas para un mismo objeto comercial; `ManagePlanes` 920 + `ManageDescuentos` 922 | `suscripciones`, triggers de período/duplicados, `apply_pending_price_changes` (cron 6:15) | FUSIONAR precios+descuentos dentro de Planes | Alto (precios) |
| **Pagos / Conciliación / Facturación / Cta. cte.** | `pagos`, `cierre-caja`, `cuenta-corriente`, `facturacion`, `cobros-entrega`, `liquidaciones`, `gastos`, `pagos/por-dia`, `facturacion/por-dia` (URL) | `AdminPayments` 1471 con tabs Eventos/Tienda/Turnera que replican listados de esas secciones; billing con 3 sub-vistas + emisores + cuentas MP; MP: 8 functions de sync/conciliación | `pagos_imputaciones`, `vw_conciliacion_pagos`, `vw_cuenta_corriente_movimientos`, AFIP + MP functions | MANTENER (unificar entradas, no lógica) | **Alto** |
| **Eventos / Reservas / Alojamiento** | `eventos`, `eventos/participantes`, `eventos/:id/lista-espera`, `solicitudes-alojamiento`, `waitlist-plantillas`, `cambios-paquete` (URL); público `/eventos/:id`, `/mi-reserva/:token`, `/viaje/mi-reserva`, `/encuesta`, `/interes`, `/roadbook` | El dominio más pesado: `AdminEventReservations` **2901**, `EventForm` 1367, `EventDetail` 1226, `ReservationStatusCard` 1398, `ReservationDrawer` 1252, `EventLodgingManager` 1148; ~15 edge functions de mails de evento | `event_reservations`, paquetes, `admin_create_event_reservation`, `build_payment_plan_snapshot`, triggers de paquete | SIMPLIFICAR (no tocar pricing ni paquetes) | **Alto** |
| **Programas** | `programas`, `programas/:id`, `programas/:id/flujo/:id` (URL), público `/formacion-inicial` | El runner de flujo es el mismo componente que `procesos/runner`; `/formacion-inicial` sin link interno | `enroll-programa`, `expire-programa-cuota2`, `programEnrollment.ts` | MANTENER | Medio |
| **Turnera** | `turnera` (sidebar), público `/reservar`, `/reservar/:slug`, confirmación, transferencia | `AdminTurnera` 1100 (6 tabs); `BookingFlow` 1212; sin capa compartida; `/reservar` sin entrada desde ningún portal (link externo/QR) | `reservas_turnera`, 8 functions turnera, cron holds 5min | SIMPLIFICAR | Medio |
| **Tienda** | 12 rutas `tienda/*` en sidebar + `incidentes-escaneo` y `control-mercaderia`; públicas `/tienda`, `/preventa/:id`, 2 redirects de pago | `StoreVentas` ya agrupa 5 tabs; `StoreOrders` 1168 + `StorePreorders` 991; 4 functions de preferencia MP casi iguales (`-saldo`, `-total`, `-alumno-saldo`) | `store_orders`, `adjust_store_stock`, `vw_stock_inconsistencias` | FUSIONAR (12 → ~5 entradas) | Medio |
| **Depósito** | 10 items de nav propios + `entregas/:id`, `procesos/:id` | `DepositoStock` vs `tienda/stock`; `DepositoCambios` vs `tienda/cambios`; `SupplierOrders` montado en ambos portales; `AdminEntregaDetail` **1951** y `DepositoEntregaDetail` 1137 son casi el mismo flujo; `Camioneta` 1026 y `Externos` de uso dudoso | conteos, movimientos, `apply_stock_count_adjustments` | FUSIONAR entregas admin/depósito; ARCHIVAR candidatos de bajo uso | **Alto** (stock) |
| **Comunicaciones** | `comunicaciones`, `email-masivo`, `whatsapp-conciliador` (sidebar), `whatsapp-historial` (URL) | ~20 functions de email, muchas casi idénticas para reservas; `AdminBroadcasts` 1142; `WhatsAppConciliador` 1095 | `enqueue_email`, `process-email-queue`, plantillas | SIMPLIFICAR / consolidar plantillas | Medio |
| **Procesos / Tareas** | `procesos`, `procesos/plantillas` (URL), runners en admin y depósito | Runner duplicado en 2 rutas; solapamiento conceptual con Programas | `process_instances`, `tareas`, `process-complete-instance` | SIMPLIFICAR | Bajo |
| **Coaches** | `coaches`, `asesoria`, `liquidaciones` (admin) + 10 rutas `/coach/*` | Sin `CoachLayout`; `liquidaciones` existe en ambos portales; `CoachChequeoAlumnos` 895 compartido | `coach_ausencias`, feedbacks, liquidaciones | SIMPLIFICAR (agregar layout) | Bajo |
| **Superadmin/Admin** | `metricas`, `gastos`, `centro-control` (URL), `gestion-redes` (URL), `historial`, `sedes`, `admins`, 4 `*/por-dia` (URL) | `SuperAdminGastos` 1967; las 4 páginas "por día" son drill-downs sin nav | `user_roles`, `has_role`, audit log | ARCHIVAR lo no navegable tras confirmar uso | Bajo/Medio |
| **Integraciones** | Sin pantalla propia (MP en `facturacion`, Google Calendar en turnera, AFIP en billing) | 99 edge functions sin agrupación; 15 sin referencia | MP, AFIP, Mailgun/Brevo, Google Calendar | MANTENER + inventariar crons reales | **Alto** |

## Núcleo mínimo propuesto (8 módulos)

1. **Alumnos** (ficha única: datos, plan, cuenta corriente, actividad)
2. **Planes y precios** (planes + precios + descuentos + solicitudes de cambio)
3. **Dinero** (cobros, conciliación MP, cuenta corriente, facturación, cierre de caja)
4. **Eventos y viajes** (evento, paquetes/alojamiento, reservas, plan de pagos)
5. **Turnera**
6. **Tienda + Depósito** (catálogo, ventas, stock, entregas — una sola verdad de stock)
7. **Entrenamiento y coaches** (planificación, asistencia, feedback, liquidaciones)
8. **Comunicaciones y tareas** (plantillas, broadcasts, WhatsApp, procesos/tareas)

Fuera del núcleo (candidatos a archivar tras confirmación de uso): Gestión de Redes, Centro de Control, Camioneta, Externos, Incidentes de escaneo, Record del Ahora, WhatsApp historial, páginas "por día", Playbook de plan.

## Orden sugerido de revisión (qué mirar primero)

| # | Qué | Por qué | Riesgo |
|---|---|---|---|
| 1 | Las 3 rutas duplicadas exactas y los redirects legacy | Cero riesgo, cero pérdida funcional | Bajo |
| 2 | Rutas admin no navegables (24) — decidir con vos cuáles se usan | Define cuánto se puede archivar | Bajo |
| 3 | Inventario real de crons en DB vs 15 functions sin referencia | Puede haber procesos críticos sin agendar o functions muertas | Medio |
| 4 | Depósito vs Tienda (stock, cambios, entregas) | Duplicación real de una misma operación | Alto |
| 5 | Sidebar admin: 41 entradas → ~8 módulos | Mayor ganancia de claridad operativa | Bajo (solo navegación) |
| 6 | Dominio Eventos/Reservas (los 5 archivos >1100 líneas) | Mayor costo de mantenimiento | Alto |
| 7 | Consolidación de plantillas/functions de email | ~20 functions casi iguales | Medio |

## Siguiente paso

Si aprobás, el próximo entregable es la **verificación del punto 3** (crons reales en DB, solo lectura) y una propuesta concreta de sidebar de 8 módulos, sin borrar nada todavía.
