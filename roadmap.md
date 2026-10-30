## San Luis · Encuesta gastronómica con comidas adicionales (30/10)
- [x] Tarjeta informativa de pensión desde el paquete + desayuno incluido; sin pregunta de pensión
- [x] Comidas adicionales solo del programa real y Extras activos, total cantidad × precio, excluye ya contratadas; solicitud validada en servidor; visible en reporte admin
- [ ] Cargar programa real de almuerzos/cenas y Extras ARS 35.000 (bloqueado: falta el programa de comidas) y habilitar la encuesta para San Luis

## Maratona · Disponibilidad compartida (27/10)
- [x] Cupo comercial compartido servidor/frontend; inventario 10 dobles / 20 plazas sin género ni asignación; grupos de alojamiento comunes y auditoría, sin tocar solicitudes/reservas/pagos
- [x] RPC público 15 disponibles en las cuatro modalidades; navegador invitado desktop/móvil, 21 pruebas unitarias y regresiones SQL aisladas; sin publicar ni crear reservas reales

## Facturación · UX de cola (25/10)
- [x] Ficha exacta en nueva pestaña; filtros y pestaña persistentes en URL sin selección
- [x] Refresco de solo lectura al volver, deduplicado, sin perder páginas ni aceptar respuestas antiguas; Reprocesar explícito
- [x] 33 pruebas; navegador autenticado desktop/móvil y F5; tipos/compilación automáticos OK; cero operaciones financieras, sin publicación

## Conciliación 0083 · Dos huecos acotados (23/10)
- [x] 0084 aplicada y existencia confirmada: ingreso reconocido separado del consumo; vista real mantiene haber1000 antes/después de aplicar200, obligación inicial0/otra600→400/disponible0
- [x] RPC y trigger bloquean crédito→vínculo; crédito nuevo bloqueado tras vínculo; ambas carreras aisladas pasan; apply_credit_ajuste_to_suscripcion real conservada
- [x] Test7 original reproducido solo en fixtures (49868+54000+71240+71240), split admin autorizado preservado; regresiones SQL anteriores y 802 tests pasan, compilación automática OK; Natalia sin modificaciones y frontend sin publicar

## Natalia Basilico · Conciliación autorizada (23/10)
- [x] Evidencia y 26 candidatos revisados; sin corrección masiva
- [x] Migración 0083 y UI; 802 tests, SQL rollback y carreras aisladas; compilación automática OK
- [x] Julio/agosto Natalia conciliados atómicamente; backup antes/después en audit_log 12db5acc-ac47-4ffb-853d-b5f5ca1b8fcf
- [x] Query y navegador admin: ARS 577910/577910/saldo0, EUR 2478.61/500/saldo1978.61, ambos MP disponible0; sin comunicaciones/facturas; frontend sin publicar

## Cola de facturación · Exclusión reversible (23/10)
- [x] Exclusión/reinclusión individual y masiva auditadas, filtro y persistencia
- [x] Bloqueo servidor de todos los caminos de emisión y carreras, con locks compartidos e identidad legacy
- [x] 799 tests; migración y tests reversibles/concurrentes en PostgreSQL aislado; navegador admin escritorio/móvil y compilación OK; sin publicar
- [x] Producción: 0 exclusiones nuevas / 0 acciones nuevas; pagos y comprobantes reales sin operaciones

## San Luis · Presentación reprogramada (20/10)
- [x] Título, distintivo y fecha corregidos en catálogo, carrusel y detalle mediante helper aislado, sin modificar datos
- [x] 22 pruebas OK; tarjeta y detalle desktop/móvil 320/390; sesión propia conserva Ver estado y reserva
- [x] Sin publicación ni despliegue por pedido expreso; pendiente únicamente autorización futura para publicar

## San Luis · Cambio seguro de cuenta (20/10)
- [x] Cambio visible, limpieza de invitado y edición sin guardar con confirmación
- [x] Prioridad del enlace personal, aislamiento de identidad; 728 tests y SQL reversible OK
- [x] Móvil 320/390 y escritorio con sesión real; versión nueva comprobada en reybaud-app.com; política v3 intacta


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
- [x] Zona horaria de negocio: nuevo `src/lib/businessTime.ts` (America/Argentina/Buenos_Aires). Todo "hoy" del checkout, de la reutilización de suscripciones y de `notify-cash-payment` usa hora argentina, nunca UTC ni la del navegador
- [x] El período de compra declara su intención (`buy_now` vs `renew_next_period`) y viaja explícito hasta la creación de la suscripción y el checkout
- [x] Identidad del checkout validada contra la sesión activa (si hay sesión, gana la ficha de esa sesión; sin sesión no se fuerza login)
- [x] Regresiones nuevas de borde: 31/08 21:48 ART (= 01/09 UTC), febrero bisiesto y no bisiesto, fin de año, compra inmediata vs renovación anticipada. 381 pruebas en verde

## Reingreso: elegir qué mensualidad se paga (caso Emiliano Grosso)
- [x] Corrección de datos: el pago real de Mercado Pago 175612089827 (31/08, ARS 83.500) quedó imputado a la mensualidad de septiembre; se quitó la acreditación manual duplicada. Cuenta corriente de septiembre: cargo 83.500 + pago 83.500 = 0. La cuota artificial de agosto sigue cancelada y sin haber.
- [x] Nueva tabla `reingreso_selecciones` + RPCs `get_reingreso_checkout_context`, `registrar_seleccion_reingreso`, `completar_seleccion_reingreso` (con auditoría en audit_log y en el historial del alumno)
- [x] Si el alumno viene de una baja o de un corte de continuidad, el checkout pregunta "¿Qué mensualidad querés pagar?" con fechas completas, plan y monto, y marca la deuda real si existe
- [x] La elección se guarda en la base (no en el navegador) y manda sobre cualquier inferencia de período
- [x] Si ya existe una obligación para el período elegido, se reutiliza; nunca se duplica
- [x] Alumno activo con continuidad: sigue la renovación automática actual, sin preguntar
- [x] 10 pruebas nuevas de reingreso; batería completa: 391 en verde

## Tienda y depósito: pago ≠ estado operativo, etiquetas y cancelaciones
- [x] `pagado_at` como única fuente de pago; estado del pedido reservado a logística (nuevo/preparando/en camioneta/enviado/entregado/cancelado)
- [x] Cobro en efectivo posible aunque el pedido ya esté preparando o en camioneta, sin pisar el estado operativo
- [x] Cancelación con motivo desde Depósito y Admin; si la mercadería está afuera, el stock se repone recién al confirmar el retorno físico
- [x] Camioneta: ítems de pedidos cancelados marcados `CANCELADO · RETORNAR` con acción de retorno
- [x] Etiquetas Niimbot con talle y cantidad, jerarquía grande y QR sólo si hay saldo pendiente
- [x] Importes de línea mostrados en la moneda del pedido (precios base legacy USD)
- [x] Stock de combos consultado a la base (`get_combo_available_stock`)
## Camioneta · Referencia breve en WhatsApp
- [x] Incluir número, producto, variante, cantidad y restantes en avisos desde Pedidos y Camioneta
- [x] Validar pruebas relevantes y tipos; no publicar ni desplegar

## Eventos · Estado de publicación (camp/viaje)
- [x] Lógica pura de 6 fases (producto, costeo, pricing, público, QA, lanzamiento) + tests
- [x] Bloque "Estado de publicación" en edición de camp/viaje; checklists QA/lanzamiento en metadata
- [x] Sin publicar ni tocar datos de Rimini/Italia-Suiza-Austria

## Landing Emilia Romagna 2027
- [x] Imagen principal como banner con proporción fija (móvil y escritorio)
- [ ] Reemplazar carrusel por 6 originales en alta y publicar — bloqueado: enlaces expiraron a las 23:15 y devuelven 403; solicitar URLs renovadas
- [x] Activar `contain_blur_background` y verificar desktop/mobile con las imágenes actuales

## Simulador de costos
- [x] Punto de equilibrio por margen de contribución (Rimini_2027 = 5)
- [x] Margen objetivo "No aplica" en modo honorario
- [x] Implementar hero general single/carrusel en Viajes/Eventos, editor metadata, tests y validación mobile/desktop; no modificar imágenes de Austria ni Emilia Romagna

## Emilia Romagna 2027 · aviso de moneda en compra
- [x] Retirar de la landing el aviso público de política de pago internacional.
- [x] Mostrarlo una sola vez antes de confirmar/pagar en el flujo reusable de reserva, según metadata.payment_policy.
- [x] Verificar flujo, compilación y publicar junto con la mejora del Resumen de Liquidaciones.

- [x] Actualizar comunicación de reserva pública, configurar Emilia Romagna como audiencia abierta y validar desktop/mobile.
- [x] Publicar la nueva comunicación de reserva pública.
- [x] Máquina de estados comerciales de programas (fases, sedes con cupo, lista de espera por sede, playbook) — sin emails

## Programas de pago único · Renovaciones falsas
- [x] `renew-monthly-subscriptions`: excluir planes no renovables (`renovacion_auto_permitida=false`, `frecuencia='unico'`, `es_programa_cerrado=true`); la mensualidad renovable sigue igual
- [x] `renew-monthly-subscriptions`: cerrar la sub anterior como `finalizada` (paga) en vez de `vencida`; `vencida` queda sólo para impagos que marcan otras rutinas
- [ ] Limpieza manual de los cargos ya creados en "Programa Iniciación 2026/2": Gerardo Adrian Vlceck (01/09 cancelada, 01/10 pendiente $175.000) y Ludmila Carballo (01/10 pendiente $175.000)

## Programa Iniciación 2026/3 · inscripción productiva
- [x] CTA del hero según fase y ancla al formulario en inscripción/lista de espera
- [x] Verificar beneficio personal, sedes/cupos y checkout en desktop/mobile
- [x] Reenviar solo la prueba de apertura a scarlettbonatto@gmail.com con el beneficio existente
- [ ] Publicar frontend y confirmar reybaud-app.com
- [x] Clases de programa → Agenda puntual (profesor pendiente, idempotente) + backfill Iniciación 2026/2 (KDT 11:00–12:30, 8ª el 10/10) + calendario en Agenda
- [x] Natalia no ve Liquidaciones: auditado, sin bug de permisos (Finanzas → Contabilidad); falta confirmar con captura de la usuaria

## Facturación automática Fase 1 (2026-10-05)
- [ ] Resolución de emisor por cuenta receptora/segmento, sin fallback a Claudio
- [ ] Lock "emitiendo", recuperación CAE, conciliación
- [ ] Período desde el cobro, solo ARS, estados nuevos
- [ ] Ingreso automático a cola (mensualidades, eventos, tienda)
- [ ] Interruptor por emisor/segmento con fecha de activación (apagado por default)
- [ ] UI bandeja: emisor, cuenta, motivo, período, moneda, estado
- [ ] Fix pendiente: v_event.nature en admin_create_event_reservation
- [ ] Devoluciones: botón "Vincular devolución" en Gastos > MP (refund → reservation_payments/store_orders, RPC admin idempotente, "Revisión manual" si no hay match)
- [ ] Viajes: Pagos recibidos / Devoluciones / Cobrado neto; pagos "Devuelto"/"Devuelto parcialmente"; deuda exigible 0 si cancelada
- [x] Ruteo manual de cobros por unidad (Escuela a Josilene) + auto-facturación segura. Sin emitir reales.

## Ficha alumno · DNI/CUIT
- [x] Ficha abierta por ?alumno=ID inicializa el formulario; bloquear guardar si no está inicializado
- [x] Campo "Tipo de documento" (DNI / CUIT/CUIL) con validación y auto-sugerencia
- [ ] Validar con ARCA: código listo; bloqueado hasta asociar ws_sr_constancia_inscripcion a los certificados en ARCA

## Facturación masiva · emisor por fila + ARCA
- [x] Modal sin emisor global; emisor y cupo por fila/emisor; "Revisar emisor" bloquea solo esa fila
- [x] Número y fecha consultados a ARCA justo antes de cada emisión; reconciliación antes de reintentar
- [x] Ticket WSAA reutilizable guardado en backend (facturas y notas de crédito)
- [ ] Reintentar las 11 facturas fallidas del 06/10 (pendiente de OK del usuario; las 4 de WSAA pueden necesitar esperar que venza el ticket anterior)

- [x] Auditoría ARCA: probado consultar-padron-afip (A13) en modo lectura con CUIT Francisco

## Viajes · Noches extra
- [x] Admin "Modificar noche extra" con vista previa económica, compañero e historial
- [x] Link público: individual / compartida / invitación con aceptar-rechazar
- [x] Rooming "Noches extra" separado + exportación
- [ ] Caso Rodrigo Carballeiro + Marcelo Suanni: aplicar cuando Admin lo confirme
- [x] Envío aviso apto físico Training Camp San Luis

## Viajes · Bormio "La Gran Conquista Alpina"
- [x] Respaldo, precios por etapa (doble/individual +€600), seña €500, contenido y "Fechas a confirmar" (borrador)
- [ ] Fecha definitiva: DB inicio y fin 21/06/2027 contradicen 8 días / 7 noches; esperar aclaración sin sobrescribir
- [ ] Finalizar encabezado premium, CTA y pruebas; auditar términos y fotografías oficiales con derechos
- [ ] Cancelación, autorización de fotos y revisión de cuotas (esperan confirmación)
- [ ] Publicación (requiere autorización)

## Alumnos · Acceso a entrenamientos por deuda
- [x] Regla de acceso efectiva en base (RLS/RPCs) + app, gracia día 1-5, excepción staff por rol real
- [ ] Publicar la app (espera autorización); revisar los 39 alumnos con renovación de octubre impaga

## Bormio 2027 · Correcciones puntuales (preview)
- [x] WhatsApp: mensaje "reserva" en vez de "postulación" (mismo número 5491140312299)
- [x] Aclarar "↗ €4.279 en 51 días" como próximo aumento (no es total)
- [x] Validar pasos 2-3 de reserva pública con escrituras bloqueadas, desktop/mobile
- [ ] Plan Meta Pixel + CAPI: en espera de ID del Pixel, token y decisión sobre consentimiento
- [x] Paso 3 invitado: mostrar seña €500 (no el total) en «Vas a pagar» y monto de transferencia
- [ ] Ventana de reserva de alumno: no verificada en navegador (la cuenta de prueba no es alumno)

- [x] Tienda alumno: tocar tarjeta abre /tienda/producto/:id (sin crear pedido)

- [x] Rectificar pagos directos Fernando→Ingrid (ARS 840.000) y unificar saldo efectivo de transferencias

## Talles administrativos de encuestas operativas
- [x] Registro separado, validación y auditoría con acceso exclusivo admin
- [x] Reporte, editor, CSV y métricas sin duplicar fuentes
- [x] Registrar exclusivamente las seis reservas autorizadas con control de concurrencia
- [x] Verificar métricas, seguridad, CSV y reporte desktop/mobile; sin publicar

## Clasique · Jerseys de staff
- [x] Registro especializado con validación, idempotencia, RLS y auditoría
- [x] Registrar solo Jackeline XXS, Jorge XS y Claudio S; verificar Tamara/Andrea intactas
- [x] Sección editable staff, subtotales y CSV combinados
- [x] Pruebas de recuentos, seguridad y desktop/mobile; sin publicar

## San Luis · Reprogramación organizada por Reybaud
- [x] Auditar acceso, fechas, paquetes y fuentes financieras sin cambios históricos
- [x] Elección segura y editable, consentimiento e historial; público desactivado
- [x] Gestión administrativa, fuente/nota, filtros, estado y CSV sin tokens
- [x] Política 100% y jersey optativo; andamiaje financiero bloqueado y conciliable
- [x] 10 tests de cálculo, crédito/jersey/transferencias; panel real, CSV y desktop/mobile; compilación OK
- [x] Prueba SQL reversible: seis elecciones, lectura, reintentos, revisión, consentimiento, historial, bloqueo público/financiero e invariancia de reservas/pagos/transferencias; sin ampliar permisos
- [x] Enlace desde reserva externa, limpieza de autorización jersey al cambiar elección y confirmación detallada
- [ ] Habilitación pública y operaciones reales: bloqueadas hasta revisión y autorización

## San Luis · Conciliación y propuestas preparatorias
- [x] Vista previa financiera servidor, alertas y propuestas aisladas versionadas (sin ejecución)
- [x] Gestión admin, filtros, CSV e historial; refresco y detección de cambios de fuentes
- [x] 25 tests automáticos, QA SQL reversible con deduplicación e idempotencia, navegador desktop/mobile e invariancia histórica
- [ ] Activación y ejecución monetaria: bloqueadas, requieren validación y autorización posterior

## Maratona · Apertura segura de reservas (21/10)
- [x] Enlace al flujo nativo con compuerta servidor cerrada por defecto; sin activar paquetes/planes
- [x] Checklist hotel/carrera en pool global, enlace propio y cuatro planes existentes; sin valores inventados
- [x] Cinco solicitudes conservadas y visibles; continuación auditada/idempotente bloqueada sin requisitos
- [x] 738 pruebas y compilación OK; navegador público/admin propio verifica bloqueo sin escrituras
- [ ] QA SQL reversible y concurrencia de apertura: requiere ejecutor SQL autorizado; script conservado, no ejecutado
- [ ] Verificar flujo nativo completo (invitado/titular, condiciones, cuotas y validación admin) antes de marcarlo habilitable
- [ ] Apertura real: faltan capacidades respaldadas, enlace propio, elegibilidad Alpes y autorización posterior; sin publicar ni cobros

## Maratona · Solicitudes de reserva y segunda edición comercial
- [ ] Revisar reservas Alpes y reutilizar captación pendiente sin cobros
- [ ] Cuatro variantes con/sin bicicleta y elegibilidad Alpes; contenido comercial y combinado
- [ ] Formulario persistente y gestión admin, sin plazas confirmadas ni pagos
- [ ] Pruebas de precios/seguridad y recorrido invitado/alumno, desktop/mobile; preview sin publicar

## San Luis · Inventario cerrado de reprogramación
- [x] Alojamiento confirmado para 5–8, 6–9 y 5–9/11 con los mismos cupos; regla de inventario cerrado documentada
- [x] Capa admin: renuncia validada → aprobación explícita de liberación → oferta → un reemplazo sin noches solapadas; auditoría e idempotencia
- [x] Resumen admin por paquete/noches; cero vendibles; pruebas unitarias y SQL reversible
- [ ] Habilitar reventa, precio de reventa y alta de reservas de reemplazo: requieren decisión y autorización

## San Luis · Enlace personal y comunicación
- [x] Enlace personal → sesión propia o DNI+nombre+apellido validados en servidor; token solo no abre datos; sesión invitado 2 h; límite de intentos
- [x] Encuesta en 3 opciones + ayuda, fechas como subelección; confirmación «no se devolvió ni acreditó»
- [x] Panel «Comunicar reprogramación»: 32 vigentes, validez/duplicados, vistas previas, estados y registro manual de WhatsApp
- [x] Email operativo preparado: plantilla, vista previa sin tokens, prueba a cuenta admin, autorización de audiencia, lotes ≤10 con compuertas en servidor (QA revertido)
- [ ] Activar en el servidor la función de envío (requiere autorización de despliegue)
- [ ] Publicar app, probar ruta en producción, habilitar encuesta, 1 prueba, autorizar audiencia y enviar lotes (cada paso con autorización)
- [ ] WhatsApp: manual (copiar/abrir) hasta que se apruebe una integración oficial

## San Luis · Encuesta por pasos y correo íntegro (20/10)
- [x] Separar decisión, detalles y resumen/consentimiento sin cambios SQL ni datos reales
- [x] Correo HTML/texto sin caracteres corruptos; versión v2-ascii desplegada y verificada mediante preview autenticado (sin enviar)
- [x] 713 pruebas Vitest + 2 Deno; compilación OK; móvil 320/390 y escritorio, sesión real propia y acceso anónimo verificados sin guardar
- [ ] Publicar y verificar producción: espera decisión sobre 6 hallazgos críticos previos informados; no se modificaron ni ignoraron

## Maratona · Reserva rápida para titulares Alpes (22/10)
- [x] Lista de invitación solo lectura en Apertura segura (excluye quienes ya pidieron/reservaron Maratona y bajas), con compañero de habitación Alpes
- [x] Cupo 20 participantes / 10 dobles / 20 carrera (Dirección 22/10)
- [x] Tarifa Alpes por reserva activa de Alpes (bici incluida en ambos paquetes); invitados sin sesión no la obtienen por email escrito
- [x] Link ClicPay compartido, planes 500+8 (cuota 1 vencida pasa a fecha de reserva), apertura habilitada tras QA con rollback
- [ ] Copia automática de compañero de habitación Alpes; MP en pesos +7% para Maratona; email distinto a las 7 solicitudes

## Maratona — etapa 2 (22/10)
- [x] Reserva rápida Alpes→Maratona (sesión o enlace personal), tarifa por reserva activa, habitación según Alpes, subtotal real
- [x] Apertura vuelta a cerrada (enabled/native_flow_verified = false)
- [ ] Auditoría del checkout (ClicPay con comprobante, efectivo) antes de reabrir — espera a Dirección
- [ ] Mercado Pago en pesos +7% — conflicto con confirmación solo admin
- [ ] Correo a 7 solicitudes previas y a titulares Alpes — no enviar sin autorización
- [ ] Completar compañero cuando el segundo de la pareja reserva después (hoy queda "propuesto")
- [ ] 6 avisos de seguridad pendientes

## Maratona — pendientes antes del mailing (22/10 noche)
- [x] Bloque de pago de seña tras reservar y al reingresar (ClicPay validado, referencia, efectivo, comprobante por WhatsApp)
- [x] Reserva rápida vincula la solicitud propia en la misma transacción; ambiguas se registran sin vincular
- [x] Vista previa del mailing A (10) / B (1) con exclusiones, sin enlaces reales
- [ ] Envío del mailing: no implementado; A es promocional (requiere servicio de marketing), B espera aprobación de Dirección
- [ ] Rectificación de Natalia Basilico ya enviada por error (22:23); Victoria Landó pendiente de revisión

## San Luis · Pago total reservas nuevas (28/10)
- [x] Código: landing, formularios, cobro MP invitado, mails; 796 tests + prueba Deno; navegador con política simulada sin reservas
- [ ] Activar: publicar + marcar el evento con pago total (espera autorización de la usuaria)

## San Luis · Devoluciones caso por caso (28/10)
- [x] Hernán Martinero: crédito $106.000 registrado (28/10, vinculado a su reserva, "utilizable hasta enero 2027, control manual"). Devolución $838.900 registrada (28/10, transferencia, op. MP 186569448208, devolución 489b882c + gasto 17ab6ee9). Conciliación pendiente: salió de cuenta MP personal de Scarlett.
- [x] Iván Martinero: crédito $106.000 registrado (28/10, mismas condiciones). Devolución $838.900 BLOQUEADA en audit_log (28/10): captura "Devuelto" vs app "acreditado"; pasos de conciliación documentados; NO transferir hasta resolver.
- [ ] Restan 4 devoluciones aprobadas: Marcelo Hamui, María Eugenia Louys, Marcelo Suanni, Tamara Mazur.
