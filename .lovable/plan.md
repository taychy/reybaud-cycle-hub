# Auditoría integral Reybaud — informe (sin cambios de código)

Base medida: 157 tablas, ~274 funciones DB, 99 Edge Functions, ~120 rutas, ~50 pantallas admin + 13 depósito. Datos de uso tomados por conteo de filas y actividad últimos 90 días.

## 1. Inventario y matriz A/B/C/D

### A. NÚCLEO (no se toca)
| Módulo | Rutas | Backend | Uso 90d |
|---|---|---|---|
| Alumnos / ficha única | /admin/alumnos, /admin/ver-como | alumnos (200), alumno_notas, alumno_email_links, merge_alumnos | 170 activos |
| Suscripciones y planes | /admin/planes, /admin/precios, /admin/descuentos, /alumno/pagos | suscripciones (824; 111 activas), planes, precio_historial, descuentos | alto |
| Pagos y cobranzas + MP | /admin/pagos | mp_account_movements (582/582 en 90d), mp-webhook, sync-mp-*, imputar_pago | muy alto |
| Cuenta corriente | /admin/cuenta-corriente, /cuenta/:token | vw_cuenta_corriente_movimientos, cuenta_ajustes (66), tokens (29) | alto |
| Facturación AFIP | /admin/facturacion (+ por-día) | facturas (476, 375 en 90d), facturacion_cola, auto-facturar, emit-factura-afip | muy alto |
| Eventos / camps con reservas y cuotas | /eventos, /eventos/:id, /admin/eventos, /mis-reservas | event_reservations (144), reservation_installments/payments, notify-reservation | alto |
| Entrenamiento | /admin/entrenamientos, /alumno/progreso | entrenamientos (825), entrenamientos_realizados (689), registro_sesiones (1042) | muy alto |
| Coaches | /coach/*, /admin/coaches | coaches, disponibilidad_coaches, agenda_grupal | medio-alto |
| Email transaccional | (infra) | email_send_log 2314/90d, process-email-queue, enqueue_email | muy alto |
| Auth / roles / portal | /, /portal, ProtectedRoute | user_roles, admin_profiles, has_role | crítico |
| Gastos | /admin/gastos | gastos (121, 120 en 90d), gastos_recurrentes, ejecuciones | alto |
| Tareas operativas | /admin/centro-control | tareas (114), tareas_historial | medio (auto-generadas) |

### B. DEJAR PERO SIMPLIFICAR
| Módulo | Problema | Recomendación |
|---|---|---|
| Resumen vs Centro de Control | Dos tableros de "qué hacer hoy". Centro de control ni siquiera está en el sidebar (ruta huérfana) | Fusionar en **una sola** Home admin = Tareas/excepciones + 4 KPIs. Eliminar el bloque "Datos de contexto" duplicado |
| Métricas (SuperAdminDashboard) | Se solapa con Resumen y con /admin/pagos | Reducir a 1 pestaña dentro de la Home (MRR, cobrado, morosidad, altas/bajas) |
| Tienda | 15 rutas admin + 13 depósito para 23 pedidos y 36 productos históricos | Colapsar a: Productos+Stock, Ventas, Entregas. Ver "eliminar" abajo |
| Turnera | 26 reservas totales, 4 servicios; funciona pero con muchas pantallas | Mantener 1 pantalla admin + landing pública; quitar Google Calendar sync si no se usa |
| Eventos | Buen núcleo, pero addons/rooms/roommates/surveys/announcements/external participants agregan superficie | Mantener reservas+cuotas+waitlist+habitaciones; encuestas y roadbook a C |
| Programas / Formación Inicial | Módulo paralelo a eventos, con playbook propio | Mantener el módulo (tiene cohortes y cobros reales) pero unificar el runner con procesos; no duplicar plantillas |
| Comunicación (plantillas email) | 12 plantillas, útil | Mantener editor, quitar versiones/preview duplicados |
| Liquidaciones coaches | 17 movimientos, 0 en 90d, clases_dictadas vacío | Simplificar a reporte mensual desde agenda; no módulo con reglas |
| Depósito | Rol real pero 13 subpantallas | Reducir a Stock, Ventas, Entregas, Conteos |

### C. ARCHIVAR / OCULTAR (conservar datos, sacar del menú)
- **Email masivo / broadcasts**: 17 campañas, 6.028 destinatarios — potente pero fuera del núcleo operativo y con riesgo reputacional. Ocultar; conservar tablas.
- **Marketing contacts (937, todos importados)**: 913 importados de CSV, sólo 21 manuales y 3 de tienda → base fría. Archivar.
- **WhatsApp como módulo** (`/admin/whatsapp-conciliador`, `/admin/whatsapp-historial`, extensión Chrome, register-whatsapp-contact/Google Contacts): 39 runs. Dejar sólo **acciones contextuales wa.me** en ficha de alumno y deudores. Archivar módulo y extensión.
- **Chequeo de alumnos (evaluaciones coach)**: 32 evaluaciones, todas en 90d, pero ruta no está en el sidebar. Decidir: promover a la ficha del alumno o archivar.
- **Encuestas de eventos / roadbook público**: 3 encuestas, 6 respuestas, 5 links roadbook. Archivar.
- **Camioneta / control de mercadería / incidentes de escaneo**: vehiculo_chequeos 2, scan_incidents 0. Archivar (código y rutas), conservar tablas.
- **Conteos de stock + etiquetas Niimbot/QR**: 3 conteos. Conservar el conteo (es la fuente de verdad del stock) pero ocultar etiquetas/impresión A4.
- **Proveedores / pedidos a proveedor**: 2 pedidos. Archivar pantallas, conservar datos.
- **Gestión de redes / mejoras sugeridas**: redes_sociales_tareas 0 filas, mejoras 5. Archivar.
- **Cierre de caja diario**: 1 cierre. Archivar hasta que haya operación de caja real.

### D. ELIMINAR
- **Rutas legacy tienda**: `/admin/tienda/pedidos-legacy`, `/tienda/preventas-legacy` (StoreOrders.tsx, StorePreorders.tsx) — reemplazadas por Ventas.
- **Ruta duplicada** `entrenamientos` declarada dos veces en App.tsx.
- **Promociones y Banners de tienda**: store_banners 0 filas.
- **Analytics de tienda**: duplica Dashboard de tienda con 23 pedidos.
- **Solicitudes de cambio de plan como módulo**: `solicitudes_cambio_plan` 4 filas y `cambios_plan` 7 (2 en 90d) — coexisten dos modelos. Unificar en el flujo actual dentro de la ficha del alumno.
- **Plantillas waitlist** (`waitlist_question_templates` 1 fila) y **Solicitudes de alojamiento** (`event_accommodation_waitlist_requests` 1 fila): plegar dentro del evento.
- **Cambios de paquete** (`event_package_change_requests` 0 filas) — ruta sin menú.
- **Asesoría**: 1 asignación, 0 postulaciones, pantallas en admin + coach + público. Eliminar del menú; landing pública puede quedar como página estática.
- **Procesos/playbooks genéricos**: 5 plantillas, 19 instancias, 3 runners distintos (admin, programas, depósito). Dejar **uno** solo (el de programas) y eliminar los otros dos + `/admin/procesos/plantillas`.
- **Importadores CSV/Excel de alumnos y planes** (ImportStudents/ImportPlan, `importaciones_usuarios` 1 fila).
- **Devoluciones, clases_consumidas, asistencias, training_templates, ausencias_coaches, grupo_familiar**: 0 filas y sin UI viva → esquema muerto.
- **Tablas QA** (`qa_stock_test_results`, `qa_backfill_test_results`) y **materialized views de backfill** (`mv_backfill_*`, 2.700 filas) — andamiaje de migraciones ya cerradas.
- **SuperAdminEstadoEscuela.tsx**: ruta comentada, código huérfano.
- **Pedidos externos / scrape-external-product / parse-etiqueta-externa** (11 filas): experimento.

## 2. Top 10 a eliminar primero
1. Rutas y pantallas legacy de tienda (pedidos/preventas legacy, promociones, banners, analytics).
2. Extensión Chrome WhatsApp + módulo WhatsApp + Google Contacts.
3. Importadores CSV/Excel de alumnos y planes.
4. Materialized views y tablas QA de backfill.
5. Procesos genéricos + plantillas de procesos + 2 de los 3 runners.
6. Solicitudes de cambio de plan (módulo separado) y plantillas waitlist.
7. Asesoría (admin + coach + módulo).
8. Camioneta / control de mercadería / incidentes de escaneo.
9. Encuestas de evento y roadbook público.
10. Tablas 0-filas sin UI (devoluciones, asistencias, clases_consumidas, training_templates, ausencias_coaches, grupo_familiar, redes_sociales_tareas, postulaciones_asesoria).

## 3. Top 10 intocables
Alumnos/ficha única · Suscripciones y planes · Pagos + Mercado Pago e imputación · Cuenta corriente y link público · Facturación AFIP · Eventos con reservas, cuotas y lista de espera · Entrenamientos y registro de sesiones · Coaches y agenda · Cola de emails transaccionales · Auth/roles/portal.

## 4. Duplicaciones y legacy detectado
- Resumen vs Centro de Control vs Métricas (3 tableros).
- Ventas de tienda vs pedidos/preventas legacy.
- `cambios_plan` vs `solicitudes_cambio_plan` vs cambio desde ficha.
- 3 runners de procesos.
- Pagos: circuito nuevo `pagos_imputaciones` (0 filas) conviviendo con imputación vía `cuenta_ajustes` y `mp_account_movements` → hay que decidir cuál es la verdad (ver §7).
- Entregas: `/admin/entregas-caja`, `/admin/cobros-entrega`, `/deposito/entregas`.
- Estados heredados: `suscripciones` con 6 estados (activa/pendiente/vencida/cancelada/finalizada/pendiente_verificacion) — simplificable a 4.
- `store_orders` con 7 estados para 23 pedidos.

## 5. Navegación mínima propuesta (6 áreas)
```text
Admin
├─ Hoy            Tareas + excepciones + KPIs (fusiona Resumen/Centro control/Métricas)
├─ Alumnos        Ficha: plan, pagos, cuenta corriente, entrenamiento, notas,
│                 bajas, cambios de plan, evaluación de coach, WhatsApp
├─ Eventos        Ficha del evento: paquetes, reservas, cuotas, waitlist,
│                 habitaciones, costos, comunicación. Programas = tipo de evento
├─ Dinero         Pagos/MP · Cuenta corriente · Facturación · Gastos
├─ Escuela        Coaches · Entrenamientos · Planes/Precios/Descuentos · Sedes · Turnera
└─ Tienda         Productos+Stock · Ventas · Entregas       (rol depósito: 3 pantallas)
```
Todo lo que hoy es módulo de "solicitudes" pasa a ser una acción dentro de la ficha del alumno o del evento.

## 6. Plan de limpieza por fases
1. **Ocultar (1 semana)**: sacar del sidebar los C y D; dejar rutas accesibles por URL. Cero riesgo.
2. **Validar (30 días)**: medir accesos y confirmar que no hubo pedidos de reactivación.
3. **Borrar frontend**: eliminar pantallas, componentes y rutas de los D confirmados.
4. **Borrar Edge Functions** sin invocaciones (candidatas: scrape-external-product, parse-etiqueta-externa, register-whatsapp-contact, send-prospect-roadbook, send-event-survey, sync-turnera-google-calendar).
5. **Borrar esquema**: sólo tablas con 0 filas y las MV/QA. Todo lo que tenga datos financieros o históricos se conserva.

**Conservar siempre**: alumnos, suscripciones, pagos, facturas, mp_account_movements, cuenta_ajustes, event_reservations y sus pagos, audit_log, email_send_log, entrenamientos y registro_sesiones.

## 7. Requiere decisión humana (sin evidencia suficiente)
1. ¿`pagos_imputaciones` (0 filas) es el circuito futuro o se descarta?
2. Email masivo/broadcasts: ¿se sigue usando comercialmente?
3. Chequeo/evaluaciones de coach: uso reciente alto pero sin menú — ¿se promueve o se archiva?
4. Liquidaciones de coaches: ¿pagos manuales fuera del sistema?
5. Turnera: ¿negocio en crecimiento o piloto?
6. Preventas de tienda (27) vs pedidos (23): ¿ambas modalidades siguen?
7. Programas: ¿se fusiona con eventos o queda como módulo?
8. Cierre de caja y cobros en entrega: ¿hay operación de efectivo real?
9. Sincronización con Google Calendar de la turnera.
10. Marketing contacts importados: ¿base a reactivar o descartar?

No se modificó código, base de datos ni configuración.
