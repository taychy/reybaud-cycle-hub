# Auditoría de tablas técnicas (solo lectura)

Relevamiento hecho sobre `src/`, `supabase/functions/` y `supabase/migrations/`. No se ejecutó ninguna consulta pesada ni se modificó nada. Se excluyeron datos de negocio y las tablas que pediste dejar afuera (audit_log, tareas, tareas_historial, pagos, suscripciones, facturación, reservas, alumnos, cuenta corriente, movimientos MP, stock, pedidos, eventos).

## Candidatas de alta prioridad (log puro, crecen solas)

| Tabla | Quién escribe | Qué guarda | Prescindible | Retención sugerida |
|---|---|---|---|---|
| `net._http_response` (extensión pg_net, esquema `net`) | La base al hacer `net.http_post` desde 6 migraciones/funciones y desde los cron | Respuesta HTTP completa de cada llamada disparada por la base. Con un cron cada minuto son ~43.000 filas/mes | Sí, total | 3 días (o vaciado periódico) |
| `email_send_log` | `supabase/functions/process-email-queue`, `handle-email-suppression`, `src/lib/emailLog.ts` | Un renglón por email: plantilla, destinatario, estado, error, metadata | Sí, salvo el historial que muestra Comunicaciones | 90 días |
| `gastos_mp_webhook_log` | `supabase/functions/mp-gastos-webhook` | Webhook crudo de Mercado Pago: headers, body, pago completo, status HTTP, decisión | Sí, es diagnóstico | 60 días |
| `admin_notification_events` | `create-guest-reservation`, `enroll-programa`, `expire-programa-cuota2`, consumida por `process-admin-notifications` (cron cada 1 minuto) | Cola de avisos internos ya procesados | Sí, una vez procesados | 30 días para las procesadas |
| `broadcast_recipients` | `send-broadcast`, `send-price-increase-alert` | Un renglón por destinatario de cada envío masivo | Parcial: alimenta el detalle de envíos | 180 días |
| `turnera_notificaciones` | `_shared/turneraNotifLog.ts`, `process-turnera-reminders`, `send-turnera-email` | Bitácora de avisos de turnos (enviado / en cola / error) | Parcial: se ve en la celda de Comunicaciones de la turnera | 180 días |
| `weekly_training_email_sends` | `send-weekly-training-digest` | Marca de qué alumno recibió el resumen semanal | Sí, pasado el control de duplicados | 90 días |

## Candidatas secundarias

| Tabla | Quién escribe | Qué guarda | Retención sugerida |
|---|---|---|---|
| `delivery_item_check_log` | `src/pages/deposito/DepositoEntregaDetail.tsx` | Cada tilde/destilde de ítems en una entrega | 180 días |
| `vehiculo_chequeo_scans` | `src/pages/deposito/DepositoCamioneta.tsx` | Cada escaneo de código en el chequeo de la camioneta | 180 días |
| `scan_incidents` | `SupplierOrderCheckStage.tsx`, visible en `/admin/scan-incidents` | Escaneos con error o inesperados | 180 días |
| `importaciones_usuarios` | `src/pages/admin/ImportStudents.tsx` | Resultado de cada importación masiva | 1 año |
| `email_dlq_decisions` | Sin escritor en el código actual (sólo aparece en los tipos generados) | Decisiones sobre emails fallidos | Revisar: posible tabla muerta |
| `qa_backfill_test_results`, `qa_stock_test_results` | Sin escritor en el código actual | Resultados de pruebas de QA | Candidatas a vaciado total |
| `_audit_suscripciones_20260624`, `_tmp_repair_check` | Sólo creadas por migraciones puntuales, sin uso en el código | Copias temporales de arreglos ya hechos | Candidatas a eliminación futura |

## No tocar

- `email_send_state`: es una única fila de configuración del envío de emails, no crece.
- `suppressed_emails`, `email_unsubscribe_tokens`: reglas vigentes de bajas y desuscripción, borrarlas volvería a enviar correo a quien pidió no recibirlo.
- `registro_sesiones`: es dato de negocio (sesiones de entrenamiento de los alumnos), no un log técnico.
- `whatsapp_check_runs/items/extras`, `student_activity_log`, `process_instances`: operativas y visibles en pantalla.

## Qué falta confirmar cuando la base responda

La base no está respondiendo ahora, así que el tamaño real y la cantidad de filas de cada tabla no pudieron medirse. Cuando vuelva, conviene medir peso y filas de las siete tablas de alta prioridad antes de decidir el orden de limpieza; lo más probable es que `net._http_response` sea la más grande por lejos, empujada por el proceso que corre cada minuto.

## Recomendación

Primero revisar la frecuencia del proceso de avisos internos (hoy cada minuto) y programar una limpieza de respuestas HTTP; eso baja peso y trabajo de la base al mismo tiempo. Después aplicar retención a los registros de email y al log de webhooks de gastos. Todo esto sería un paso posterior: en esta etapa no se borró ni se cambió nada.
