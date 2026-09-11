
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

## Entregas ↔ Cuenta Corriente (P1, preview)
- [x] Reasignar comprador por ítem con auditoría (`reasignar_comprador_entrega`) y diálogo en el detalle de la lista
- [x] `delivery_list_payments.alumno_id` + índice, vinculación automática sin ambigüedad y corrección manual
- [x] Vista de cuenta corriente con `cargo_entrega` y `pago_entrega` (sin duplicar pedidos/preventas ni cobros no validados)
- [x] Detalle inspeccionable en todos los movimientos de la cuenta corriente
- [ ] No se ejecutó ninguna reasignación histórica por SQL (Ale Goro → Gastón se hace desde la pantalla)

## Preinscripciones públicas (preview)
- [x] Plantillas de lista de espera publicables como formulario público (slug, publicada/activa, título/descripción pública, mensaje de confirmación, cupos informados)
- [x] Tabla `waitlist_template_entries` (respuestas directas, únicas por plantilla+email) + RLS admin y RPCs seguras (`get_waitlist_template_public`, `submit_waitlist_template_entry`, `get_waitlist_template_direct_entries`, `mark_waitlist_template_entries_seen`)
- [x] Ruta pública `/preinscripcion/:slug` (mobile first, sin login, consentimiento obligatorio)
- [x] Admin: estado, copiar link, abrir formulario, edición de datos públicos y respuestas combinadas (evento / formulario público)
- [x] Novedad admin `preinscripciones` en `count_admin_novedades` + acceso "Preinscripciones" en el menú
- [x] Lista creada y publicada: "Programa de Iniciación · Octubre 2026" (`programa-iniciacion-octubre-2026`, 15 cupos)
- [ ] Sin publicar a producción (pendiente confirmación)

## Actualización del sistema de emails (envío administrado)
- [x] Emails de acceso (registro, código, recuperación, invitación, cambio de email) migrados al envío administrado, con asuntos en español y remitente "Ciclismo Reybaud"
- [x] ~30 funciones de aviso convertidas al envío directo administrado, conservando `email_send_log` (`sent` con snapshot, `suppressed`, `failed`)
- [x] Feedback de coach y pedidos a proveedor: nueva función `send-supplier-order-email`; el navegador ya no invoca envíos genéricos
- [x] Receptor de eventos `handle-email-events` (rebote/queja/baja) con escritura en `suppressed_emails`, `email_send_log` y opt-out de `marketing_contacts`
- [x] Retirados del repo: cola/despachador, suppression, unsubscribe, envío transaccional legacy, página `/unsubscribe` y la migración de infraestructura de email
- [x] Tablas de datos (`email_send_log`, `suppressed_emails`, `email_unsubscribe_tokens`, `email_send_state`) conservadas
- [ ] Sin publicar: el cambio se completa al publicar y no puede deshacerse

## Cuenta corriente · Aplicar a deuda
- [x] Las mensualidades en estado pendiente vuelven a aparecer como deuda aplicable (la renovación automática precargaba "efectivo" y la presunción de pago las ocultaba)
- [x] Se descuenta lo ya aplicado desde saldos a favor para no ofrecer dos veces la misma deuda
- [ ] Sin cambios en datos financieros históricos (caso Paula Blasco se resuelve desde la pantalla)

## Período de la mensualidad y plan elegido (caso Laura Palermo)
- [x] Corrección de datos: el Pase Libre pagado el 31/08 pasó a período septiembre (01/09–30/09, activa); se anuló la cuota de Grupal 2x de septiembre creada por error. Pago de Mercado Pago y su fecha real intactos. Saldo de septiembre: 0.
- [x] El período que se compra ya no depende del día del pago: `resolvePurchasePeriod` (últimos 2 días del mes → mes siguiente; mes ya cubierto → mes siguiente; renovación anticipada explícita manda)
- [x] Checkout muestra "Estás pagando <mes>" con las fechas antes de ir a pagar
- [x] "Ya hice el pago" envía el plan elegido por el alumno y el período; sin plan explícito ya no se genera obligación con el plan histórico
- [x] `notify-cash-payment` reutiliza la obligación del mismo plan/período y no duplica si el período ya está cubierto
- [x] Pruebas nuevas de período de compra (9) + batería completa (376) en verde
