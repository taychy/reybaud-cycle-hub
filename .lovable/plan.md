# Auditoría de carga y disco (solo lectura)

No se modificó nada: ni código, ni base, ni configuración. Todo lo que sigue es diagnóstico con evidencia.

## Resumen en una línea

El disco no se está llenando por los datos del negocio: casi todo lo ocupa el **historial de las tareas automáticas** (5,4 GB) y el **registro de llamadas salientes** (203 MB), que nadie borra nunca. Los datos reales de alumnos, pagos y entrenamientos ocupan pocos megabytes.

## Evidencia confirmada

| Objeto | Tamaño / actividad | Qué es |
|---|---|---|
| `cron.job_run_details` | **5.447 MB** | Historial de cada ejecución de tarea automática. Nunca se purga. |
| `net._http_response` | **203 MB**, 241.967 lecturas | Respuestas guardadas de cada llamada saliente (emails, funciones). |
| Resto de tablas del negocio | 4 MB o menos cada una | `mp_account_movements` 4 MB, `entrenamientos` 840 kB, `suscripciones` 520 kB |
| Tareas automáticas activas | 19 | 1 cada minuto, 2 cada 5 min, 3 cada 15 min, 1 por hora, resto diarias |
| Consulta más costosa | 88.367 llamadas, 34,8 ms media, **51 min acumulados** | Búsqueda de factura por `referencia_tipo`+`referencia_id` |
| Segunda | 111.150 UPDATE sobre `mp_account_movements` | Reescritura completa de cada movimiento en cada sincronización |
| `mp_account_movements` | **892.867 recorridos completos** sobre 803 filas | Falta índice o consulta sin filtro indexado |
| `suscripciones` | 222.391 recorridos completos | Idem, tabla chica pero muy consultada |
| Estado del servicio | Consultas de auditoría cancelaron por timeout dos veces | La base está saturada ahora mismo |

## Ranking de fuentes de carga

1. **Historial de tareas automáticas sin purgar** — `cron.job_run_details`, 5,4 GB. Severidad **crítica** para disco e I/O: el mantenimiento automático de Postgres tiene que recorrer esa tabla enorme constantemente. Crece con cada minuto (tarea `process-admin-notifications` corre `* * * * *`).
2. **Registro de llamadas salientes sin purgar** — `net._http_response`, 203 MB y 242 mil lecturas. Severidad **alta**.
3. **Tarea `process-admin-notifications` cada minuto** — 193.117 consultas a `admin_notification_events`. Genera escritura de historial + llamada HTTP cada 60 s. Severidad **alta** (es la que alimenta los dos puntos anteriores).
4. **Sincronización de Mercado Pago cada 15 min** (`supabase/functions/sync-mp-account-movements/index.ts`, líneas 193-214 y 254-274) — recorre hasta 2.000 movimientos y hace UPDATE completo (incluyendo el campo `raw`, que es pesado) aunque no haya cambiado nada: 111.150 escrituras. Cada UPDATE reescribe la fila y genera registro de transacción en disco. Severidad **alta** en escritura.
5. **Búsqueda de factura por fila en listados** — `src/components/admin/BillingInvoiceLauncher.tsx` (líneas 63-84). Cuando el listado no pasa `existingFactura`, cada fila dispara su propia consulta al montar. 88.367 llamadas, la consulta más cara del sistema. Usos sin dato precargado: `src/pages/admin/AdminPayments.tsx:1080`, `src/pages/admin/dia/FacturasPorDiaPage.tsx:103`, `src/pages/admin/billing/TrayPendientes.tsx:343`, `src/pages/admin/billing/PendingPaymentsList.tsx:461`. Severidad **alta** (patrón N+1 clásico).
6. **Badges del panel admin cada 60 s** — `src/pages/admin/AdminLayout.tsx:190-215`: 5 consultas en paralelo por ciclo, y el efecto depende de `location.pathname`, así que se reinicia en cada navegación. Con varias pestañas abiertas se multiplica. Severidad **media**.
7. **Recorridos completos de `mp_account_movements` y `suscripciones`** (892 mil y 222 mil). Tablas chicas, así que pesa más en procesador que en disco, pero suma latencia en horas pico. Severidad **media**.
8. **Reintentos y realtime del frontend** — `src/hooks/useTareas.tsx` (recarga completa ante cualquier cambio en la tabla más un RPC de auto-resolución al montar), `src/hooks/useProcesses.tsx`, `src/pages/admin/AdminProcesos.tsx`. Severidad **media** si hay varios admins conectados.
9. **Otros temporizadores del front** — `src/pages/PublicDeliveryList.tsx:67` (consulta cada 15 s mientras la página esté abierta), `src/components/UpdatePrompt.tsx:51,174`. Severidad **baja-media**.
10. **Consultas con `select('*')` en pantallas grandes** — `src/components/reservation/ReservationDrawer.tsx` (9), `src/pages/admin/SuperAdminGastos.tsx` (7), `src/components/admin/AdminEventReservations.tsx` (7). Severidad **baja** hoy por volumen chico.

## Sospechas (no confirmadas)

- Aparece una consulta con **1.341.930 llamadas** que revisa la cola de emails y dispara un envío HTTP. No corresponde a ninguna de las 19 tareas activas hoy; puede ser una tarea de alta frecuencia ya eliminada, o un disparador interno. Hay que confirmarlo antes de tocarlo.
- No se pudo leer el panel de salud de la base (tiempo de espera agotado), así que la lectura de "100% de disco I/O" viene del indicador del producto, no de una medición propia.
- `pg_stat_statements` es acumulativo desde el último reinicio: los totales son históricos, no tasa por hora.

## Acciones propuestas, de menor a mayor riesgo

### Sin cambio de funcionalidad (recomendadas primero)

| # | Acción | Impacto | Riesgo |
|---|---|---|---|
| A1 | Purgar `cron.job_run_details` dejando los últimos 7 días y programar limpieza diaria | **Alto** (libera ~5,4 GB y baja mantenimiento automático) | Bajo — sólo se pierde historial de ejecuciones viejo |
| A2 | Purgar `net._http_response` dejando 48 h y limpieza diaria | Alto | Bajo |
| A3 | En la sincronización de Mercado Pago, actualizar sólo cuando algo cambió realmente (comparar antes de escribir) | Alto en escritura de disco | Bajo |
| A4 | Índice sobre `facturas(referencia_tipo, referencia_id)` y revisar índices de `mp_account_movements(cuenta_mp_id, mp_payment_id)` y `suscripciones(mp_payment_id)` | Medio-alto en latencia | Bajo |
| A5 | Precargar el estado de facturas en los 4 listados y pasarlo por `existingFactura` (el componente ya lo soporta) | Alto (elimina el N+1) | Bajo |

### Con cambio de comportamiento (requieren tu decisión)

| # | Acción | Impacto | Riesgo |
|---|---|---|---|
| B1 | Bajar `process-admin-notifications` de cada minuto a cada 5 minutos | Alto sobre el crecimiento del historial | Avisos administrativos con hasta 5 min de demora |
| B2 | Subir el refresco de badges del panel de 60 s a 3-5 min y no reiniciarlo en cada navegación | Medio | Contadores algo menos "al instante" |
| B3 | Pausar el refresco automático cuando la pestaña no está visible (badges, lista pública de entregas) | Medio | Ninguno perceptible |
| B4 | Revisar si `sync-mp-movements` cada 15 min puede pasar a cada 30 min | Medio | Movimientos visibles con más demora |

## Orden de implementación sugerido

1. A1 y A2 (purga + limpieza programada) — es donde está el disco.
2. A3 y A5 — eliminan la mayor parte de la escritura y de la consulta más cara.
3. A4 — índices puntuales.
4. B1 y B2/B3 — sólo si después de lo anterior sigue apretado.

## ¿Subir la instancia o optimizar primero?

**Subí la instancia ya, hoy, y optimizá después.** Con 5,4 GB de historial basura en una instancia Tiny y el login ya fallando, cualquier optimización tarda horas en aplicarse y validarse, mientras que los usuarios están sufriendo caídas ahora. Además, la purga del punto A1 sobre una tabla de 5,4 GB es en sí misma una operación pesada: conviene hacerla con más margen de recursos. Una vez estabilizado, aplicá A1-A5 y recién ahí evaluá si podés volver a un tamaño menor.
