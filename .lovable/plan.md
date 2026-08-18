# Auditoría arquitectónica Reybaud (solo lectura) + plan de reducción por fases

Auditoría hecha sobre el repo y la base actual. No se modificó código ni datos.

## Tamaño actual (medido)

- Frontend: 478 archivos `.ts/.tsx`, 152.021 líneas (14.651 son `src/integrations/supabase/types.ts`, autogenerado).
- Rutas declaradas en `src/App.tsx`: ~150 (públicas + `/alumno` + `/coach` + `/admin` + `/deposito` + `/reservar`).
- Backend: 162 tablas, 28 vistas, 305 funciones, 150 triggers, 381 policies, 505 migraciones, 98 edge functions, 20 cron jobs.

Conclusión general: la app no está rota, pero creció por acumulación. La reducción de costo está sobre todo en (a) objetos de backfill/auditoría ya cumplidos, (b) rutas y páginas legacy duplicadas, (c) crons y edge functions superpuestas, (d) módulos con uso real cero.

---

## Hallazgos por dominio

### Alumno / Auth
- Páginas: `Login`, `Portal`, `AuthCallback`, `Register`, `CompleteRegistration`, `SetPassword`, `Reingreso`, `VincularEmail`, `PendingApproval`.
- Duplicación: `/crear-clave` y `/activar-cuenta` apuntan al mismo `SetPassword`; `/politica-privacidad` y `/privacy-policy` idem. `/alumno`, `/alumno/dashboard`, `/alumno/inicio`, `/alumno/eventos`, `/alumno/tienda`, `/alumno/mas`, `/alumno/progreso` renderizan todos `StudentDashboard` (7 rutas, 1 componente).
- Código sin referencias: `src/hooks/useAdminAuth.tsx` y `src/hooks/useStudentAuth.tsx` no son importados por nadie (la auth real pasa por `ProtectedRoute` + `useAlumnoSession`).
- Propuesta: conservar el flujo; **simplificar** rutas alias (dejar redirects), **eliminar** los dos hooks muertos.

### Alumnos / CRM
- `ManageStudents.tsx` (2.081 líneas) concentra ficha, filtros, importación, acciones. `StudentPlanSection.tsx` (1.560) y `StudentCuentaCorrienteSection.tsx` (1.020) idem.
- Legacy: `ImportStudents.tsx` e `ImportPlan.tsx` no tienen ruta en `App.tsx`, solo se referencian desde `ManageStudents`. Tabla `importaciones_usuarios`: 1 fila.
- Tablas de uso casi nulo: `grupo_familiar` (0), `grupo_familiar_miembros` (0) frente a `alumno_familiares` (2) — dos modelos paralelos de familia.
- Propuesta: **separar** `ManageStudents` en subcomponentes por pestaña; **fusionar** el modelo familiar en `alumno_familiares` y marcar `grupo_familiar*` para baja.

### Entrenamientos / Asesoría / Progreso
- `Trainings.tsx`, `TrainingDetailView.tsx`, `parseTrainingExcel.ts`, `CoachEntrenamientos`, `StudentProgress`, `Asesoria`, `AdminAsesoria`, `CoachAsesoria`.
- Uso bajo: `training_templates` (0 filas), `agenda_grupal` (2), `asesoria_asignaciones` (1), `postulaciones_asesoria` (0), `asistencias` (0 filas pese a 3.028 scans), `clases_dictadas` (0), `clases_consumidas` (0).
- Riesgo: `asistencias`/`clases_dictadas` pueden ser funcionalidad recién lanzada, no muerta. Requiere confirmación operativa antes de tocar.
- Propuesta: **conservar** entrenamientos; **revisar con vos** si asistencia/clases y asesoría siguen en uso real.

### Planes / Suscripciones
- `ManagePlanes`, `ManagePrecios`, `ManageDescuentos`, `PlanSelection` (1.387), `SolicitudesCambioPlan`, `AdminPackageChangeRequests`, `AdminBajas`, `AdminPriceAlertApproval`.
- Lógica paralela en `src/lib`: `subscriptionStatus.ts`, `subscriptionPeriod.ts`, `subscriptionGuard.ts`, `subscriptionConflicts.ts`, `earlyRenewal.ts`, `paymentReuseSub.ts`, `packageChangePreview.ts`, `packageAvailability.ts`, `assignPaymentPlan.ts`, `paymentPlanCalculator.ts`, `priceStages.ts`. Son 11 módulos que resuelven variantes del mismo ciclo.
- Cron duplicado real: existen `expire-stale-intents` y `expire-stale-intents-5min` con el mismo comando y schedule (`*/5 * * * *`) → doble ejecución.
- Propuesta: **fusionar** los helpers de suscripción en un módulo `subscription/` con submódulos; **eliminar** un cron duplicado.

### Pagos / Conciliación / Cuenta corriente / Facturación
- Páginas: `AdminPayments` (1.471), `AdminCuentaCorriente`, `AdminCierreCaja`, `AdminDeliveryPayments`, `AdminEntregasCaja`, `billing/*`, `PublicCuentaCorriente`.
- **Mayor fuente de deuda técnica**: coexisten tres capas de verdad — legacy, imputaciones y backfill. Vistas: `vw_saldo_legacy`, `vw_saldo_imputaciones`, `vw_saldo_comparacion`, `vw_obligaciones_modelo_nuevo`, `vw_pagos_imputaciones_backfill_preview`, `vw_backfill_candidatos`, `vw_backfill_identidad_sugerida`, `vw_backfill_ingresos`, `vw_backfill_obligaciones`, `vw_backfill_resumen`, `vw_backfill_saldos_comparacion`, `vw_backfill_sobreimputacion`, `vw_inconsistencias_early_renewal`, `vw_pagos_inconsistencias`, `vw_turnera_sede_backfill`. La mayoría no se referencia desde `src/` ni desde edge functions (solo aparecen en migraciones).
- Tabla `qa_backfill_test_results` (1 fila) y `pagos_imputaciones` (0 filas, 1.213 scans): el modelo nuevo está creado pero sin datos.
- Propuesta: **decidir el modelo único** (imputaciones o legacy), luego **eliminar** las vistas de backfill/QA ya cumplidas. Es la reducción de mayor impacto y la de mayor riesgo: va con snapshot previo y por lotes.

### Coaches / Liquidaciones
- `ManageCoaches`, `CoachLiquidaciones`, `AdminLiquidaciones`, `CoachFeedback`, `CoachAttendance`, `CoachChequeoAlumnos` (usado también en `/admin/chequeo-alumnos` con `adminMode`, buen patrón).
- Uso bajo: `liquidaciones_mensuales` (0), `honorarios` (10), `ausencias_coaches` (0 filas, 244 scans), `feedback_coach` (7).
- Propuesta: **conservar**, revisar si liquidaciones se usa fuera de temporada antes de simplificar.

### Turnera
- `BookingLanding`, `BookingFlow` (1.212), `TurneraConfirmacion`, `TurneraTransferencia`, `AdminTurnera` (1.100), `turneraSlug.ts`.
- Edge functions: `create-turnera-mp-preference`, `create-turnera-transferencia`, `upload-turnera-comprobante`, `expire-turnera-holds`, `process-turnera-reminders`, `send-turnera-email`, `turnera-ics`, `sync-turnera-google-calendar` (8 funciones).
- `vw_turnera_sede_backfill` ya cumplió su función (backfill histórico ejecutado).
- Propuesta: **conservar**; eliminar la vista de backfill; evaluar unificar `create-turnera-mp-preference` + `create-turnera-transferencia` en una sola con `metodo`.

### Eventos / Viajes / Reservas
- Dominio más pesado del frontend: `AdminEventReservations.tsx` (2.872), `EventForm` (1.367), `ReservationStatusCard` (1.398), `ReservationDrawer` (1.252), `EventLodgingManager` (1.148), `EventPackagesEditor`, `EventCostSimulator`, `EventSurveyManager`, `EventRoadbookEditor`.
- Uso cero: `event_cost_items`, `event_cost_actuals`, `event_cost_simulations` (0 filas cada una — el simulador de costos nunca se usó en producción), `event_results` (0), `reservation_cash_announcements` (0).
- Sin referencias: `src/components/admin/ReservationChecklistViewer.tsx`.
- Edge functions superpuestas de email de evento: `send-reservation-confirmation`, `send-reservation-confirmed-with-payment`, `send-reservation-payment-recorded`, `notify-reservation`, `notify-event-cash-payment`, `send-event-announcement`, `send-event-checkin-email`, `send-event-survey`, `send-roommate-notification`, `send-result-request-email` (10 funciones que hacen "render + send" con la misma infraestructura de `send-transactional-email`).
- Propuesta: **fusionar** los senders de evento detrás de `send-transactional-email` con `template_key`; **eliminar** `ReservationChecklistViewer` y decidir sobre el simulador de costos.

### Programas / Playbooks / Procesos
- `AdminProgramas`, `AdminProgramaDetalle`, `AdminProgramaFlujoRunner`, `AdminProcesos`, `AdminProcessTemplates`, `PlanPlaybookEditor`, `DepositoProcesoRunner`, `useProcesses.tsx`.
- Hay **dos runners** del mismo motor (`/admin/programas/:cohortId/flujo/:instanceId` y `/admin/procesos/runner/:instanceId` apuntan al mismo `AdminProgramaFlujoRunner`) más el de depósito.
- `process_templates`: 5 filas.
- Propuesta: **fusionar** procesos y playbooks de programa en un único motor con una sola ruta canónica.

### Tienda
- Rutas legacy vivas: `/admin/tienda/pedidos-legacy` → `StoreOrders.tsx` (1.168) y `/admin/tienda/preventas-legacy` → `StorePreorders.tsx` (991), mientras `/admin/tienda/pedidos` y `/preventas` ya redirigen a `StoreVentas`. Equivalente en depósito: `DepositoPedidos.tsx` / `DepositoPreventas.tsx` conviven con `DepositoVentas.tsx`.
- 4 edge functions de preventa casi idénticas: `create-preorder-mp-preference`, `create-preorder-saldo-mp-preference`, `create-preorder-total-mp-preference`, `create-preorder-alumno-saldo-mp-preference`.
- Uso cero: `store_banners` (0 filas, 987 scans), `scan_incidents` (0), `store_combo_items` (2), `store_quick_access` (5).
- Propuesta: **eliminar** las rutas y páginas `*-legacy` una vez confirmado que nadie las usa; **fusionar** las 4 funciones de preventa en una con parámetro `modo`.

### Depósito / Logística
- 16 rutas bajo `/deposito`. Módulos de uso nulo: `vehiculo_chequeos` (2), `vehiculo_chequeo_scans` (0 filas, 853 scans), `pedidos_externos` (11), `delivery_supplier_payments` (4), `stock_counts` (3).
- Niimbot: `niimbotLabels.ts`, `orderNiimbotLabels.ts`, `NiimbotLabelPreviewDialog`, `OrderLabelPrintDialog`, `ProductLabelsDialog`, `printBlob.ts` — ya señalado en la auditoría previa como candidato a archivar.
- Propuesta: **eliminar** chequeo de vehículo y Niimbot si confirmás que no se usan; **conservar** stock/conteos/entregas.

### Comunicaciones (email / WhatsApp)
- 30+ edge functions de envío. Sin referencias en código: `handle-email-suppression`, `preview-transactional-email`, `notify-students-incomplete-data`, `send-monthly-plan-changes-reminder` (esta sí tiene cron), `mp-gastos-webhook`.
- WhatsApp: `WhatsAppConciliador` (1.095) + `WhatsAppHistorial` + `whatsapp_check_extras` (8 filas) + `register-whatsapp-contact`.
- Cron duplicado real: `process-admin-notifications` y `process-admin-notifications-1min`, mismo comando y schedule (`* * * * *`) → doble ejecución por minuto.
- Propuesta: **fusionar** senders en `send-transactional-email` + plantillas; **eliminar** el cron duplicado.

### Tareas / Dashboard / Métricas / Super Admin
- `AdminDashboard` (752), `SuperAdminDashboard`, `SuperAdminControl`, `SuperAdminGastos` (1.967), páginas `dia/*` (facturas, pagos, bajas, nuevos usuarios por día).
- `SuperAdminEstadoEscuela.tsx` existe pero su ruta está **comentada** en `App.tsx:255` → página muerta.
- `AdminMejoras.tsx` no tiene ruta ni importadores; `mejoras_sugeridas` tiene 5 filas.
- Propuesta: **eliminar** `SuperAdminEstadoEscuela` y decidir sobre `AdminMejoras`.

### Backend Supabase (transversal)
- 305 funciones y 150 triggers es el punto más caro de mantener: la lógica de pagos/suscripciones vive repartida entre triggers, RPCs y frontend.
- 505 migraciones incluyen muchas reparaciones puntuales de datos ya aplicadas.
- Propuesta: **inventariar** funciones sin llamadas (desde código ni desde otras funciones) antes de borrar nada.

---

## Arquitectura mínima objetivo

```text
Portales (4):  alumno   coach   admin   deposito
Dominios (9):  identidad · CRM · entrenamiento · suscripciones
               dinero (pagos+cuenta corriente+facturación)
               eventos+turnera (motor de reservas único)
               comercio (tienda+depósito)
               comunicaciones (1 sender + plantillas)
               operación (procesos+tareas+métricas)
Backend:       1 modelo de saldo · 1 motor de reservas · 1 motor de procesos
               1 sender transaccional · crons sin duplicados
```

## Orden seguro de reducción por fases

1. **Fase 0 — sin riesgo (limpieza pura).** Eliminar crons duplicados (`expire-stale-intents-5min`, `process-admin-notifications-1min`), archivos sin referencias (`useAdminAuth`, `useStudentAuth`, `ReservationChecklistViewer`, `SuperAdminEstadoEscuela`), y rutas alias redundantes de `/alumno`.
2. **Fase 1 — legacy confirmado.** Retirar `*-legacy` de tienda y depósito, y los módulos de uso cero que confirmes (Niimbot, chequeo de vehículo, simulador de costos de evento, `grupo_familiar*`).
3. **Fase 2 — consolidación de emails.** Unificar los ~10 senders de evento y los 4 de preventa detrás de `send-transactional-email` con `template_key`.
4. **Fase 3 — motor único de procesos** (programas + playbooks + depósito) con una sola ruta.
5. **Fase 4 — modelo único de dinero.** Elegir imputaciones vs legacy, migrar, y recién ahí borrar las 15 vistas de backfill/QA.
6. **Fase 5 — refactor de archivos gigantes** (`AdminEventReservations`, `ManageStudents`, `SuperAdminGastos`) en subcomponentes.

## Riesgos y control

- Cada fase se ejecuta y se verifica sola, con posibilidad de revertir antes de la siguiente.
- Antes de borrar cualquier tabla o vista: snapshot lógico y una semana de "marcado como deprecado" sin uso.
- Fase 4 solo con tu aprobación explícita: toca la verdad contable.

## Antes de empezar necesito que confirmes

1. ¿Se usan hoy: asistencia de clases, liquidaciones de coaches, asesoría, simulador de costos de evento, Niimbot y chequeo de vehículo?
2. ¿El modelo de dinero objetivo es `pagos_imputaciones` (hoy vacío) o seguimos con el legacy?
3. ¿Arrancamos por la Fase 0 (limpieza sin riesgo) en la próxima tanda?
