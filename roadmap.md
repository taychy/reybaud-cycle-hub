
## Tienda · Prendas de prueba (cierre)
- [x] Corregir `prueba_usar_como_cambio` (sin `cambio_in` sobre la prenda de prueba; crear cambio real ligado por `prueba_origen_id`)
- [x] Idempotencia backend en `crear_prenda_prueba` (`prueba_idempotency_key`)
- [x] UI: elegir ítem original del pedido en "Usar como cambio" + key de idempotencia en alta
- [x] Tests SQL `supabase/tests/store_pruebas_stock_regression.sql` + Vitest/typecheck/build

## Admin > Alumnos · Filtros agrupados (UI)
- [x] Chips primarios (Todos/Activos/Pendientes/Vencidos/Nuevos) + menús Estado/Acceso/Plan/Calidad de datos

- [x] Entrenamientos semanales por email: preferencia por alumno (OFF por defecto), envío manual con vista previa y cron dominical 18:00 AR (21:00 UTC). Fuente única: RPC get_entrenamientos_semana_alumno + helper src/lib/weeklyTraining.ts.

## Tienda · Pago en efectivo (preview)
- [x] Checkout público con opción "Efectivo al retirar" (sin Mercado Pago, pedido pendiente de cobro)
- [x] Confirmar pago en efectivo desde Depósito y Admin, con reglas únicas en `src/lib/storeCashPayment.ts` (idempotente, bloquea pedidos ya pagados o anulados)

## Tienda · Campañas condicionadas por forma de pago (preview)
- [x] Campo `medios_pago` en campañas (default ambos), UI Admin, resolver backend por medio y checkout público/producto coherentes

## Rendimiento · Reducción de carga del Resumen Admin (emergencia)
- [x] Resumen liviano: 4 contadores `head:true` + accesos rápidos; sin `rebuild_facturacion_cola()` al abrir
- [x] Se dejan de montar en el Resumen: ResumenFinancieroMes, AdminOperationalCalendar, BirthdayWidget, DeliveryCashWidget (archivos intactos)
- [x] Polling de badges en AdminLayout resuelto
- [ ] Pendiente aparte: purga de historial de tareas automáticas y de respuestas HTTP

## Cobros recurrentes MP · P0 identidad (preview)
- [x] Tabla `mp_preapprovals` (preapproval → alumno → plan) con RLS admin, auditoría y estados detectado/confirmado/ignorado
- [x] `sync-mp-account-movements` registra la identidad recurrente (metadata.preapproval_id / transaction_data.subscription_id, plan_id, email, importe) sin imputar nada
- [x] Bootstrap de identidad desde `mp_account_movements.raw`: 13 preapprovals, 12 con alumno sugerido (sin tocar pagos ni suscripciones)
- [x] Pestaña "Recurrentes MP" en /admin/pagos para vincular alumno + plan y confirmar (no imputa)
- [ ] P1/P2: motor de imputación y backfill financiero (no incluidos)

## Tareas · Retiro de la funcionalidad (preview)
- [x] Rutas y accesos de UI eliminados: `/coach/tareas` (App.tsx), botón "Mis tareas" en el panel del coach, inbox de tareas en Centro de Control
- [x] Archivos eliminados: `src/pages/coach/CoachTareas.tsx`, `src/components/admin/TareasInbox.tsx`, `src/hooks/useTareas.tsx`, `src/components/coach/GraduacionTareaCard.tsx`
- [x] Sin ejecución automática desde frontend: ya no se llaman `generate_tareas_automaticas` ni `auto_resolve_tareas_automaticas`, ni se consulta el contador de tareas en `useCoachHome`
- [ ] Tablas `tareas` y `tareas_historial` intactas (datos históricos conservados) para una eventual purga posterior; funciones/RPC SQL sin cambios

## Mantenimiento técnico · Log de respuestas HTTP (pg_net)
- [ ] Purga autorizada de `net._http_response` (conservar 3 días, lotes de 500 por ctid, sin VACUUM FULL): intento del 07/09 no pudo ejecutarse porque la base no respondía (pooler caído). Reintentar cuando vuelva.
