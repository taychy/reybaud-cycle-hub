# Auditoría WhatsApp — inventario y plan por etapas

Solo lectura. No se cambió código, base, secretos ni producción, y no se envió nada.

## 1. Qué existe hoy

**Envío automático desde el servidor: ninguno funcionando.**
- `supabase/functions/_shared/turneraWhatsapp.ts`: es un envío por Twilio ya escrito (pasa por el gateway de conectores, usa `ContentSid` y `TWILIO_WHATSAPP_FROM`). Lo llama `process-turnera-reminders` (recordatorios a alumno y coach), con registro en `_shared/turneraNotifLog.ts`. Nunca se activó:
  - El conector Twilio ("Scarlett's Twilio") existe en el workspace pero **no está vinculado** al proyecto, así que falta `TWILIO_API_KEY`.
  - Falta el secreto `TWILIO_WHATSAPP_FROM`.
  - No hay claves `turnera_wa_content_sid_*` en `app_config`.
  - `turnera_notificaciones` tiene 0 filas de WhatsApp (solo email: 20 sent, 40 queued, 2 error).
- Otras funciones solo mencionan WhatsApp en textos o links (notify-reservation, process-installment-reminders, send-delivery-ready-pickup, etc.).

**Receptor de mensajes entrantes: está preparado, pero sin uso.**
- `supabase/functions/whatsapp-webhook` (Meta Cloud API, `verify_jwt=false`): responde la verificación con `WHATSAPP_VERIFY_TOKEN`, valida la firma con `META_APP_SECRET` y guarda los mensajes en `whatsapp_conversations` / `whatsapp_messages`.
  - Faltan los dos secretos, así que la verificación de Meta hoy fallaría.
  - **Riesgo:** sin `META_APP_SECRET` la firma no se valida y cualquiera podría escribir en esas tablas.
  - Las tablas tienen 0 filas: nunca llegó nada.

**Tablas:** `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_pending_tasks` (0 filas); `whatsapp_check_runs/items/extras` (44 corridas, se usan para el chequeo manual de grupos); `turnera_notificaciones` (bitácora multicanal).

**Secretos configurados:** ninguno de Twilio ni de Meta/WhatsApp. Solo hay Mercado Pago, Brevo, Resend, Google Calendar, `CRON_SECRET` y `LOVABLE_API_KEY`.

**Flujos manuales con links wa.me (lo único que funciona hoy):**
- Admin → Programas → Preinscriptos (`ProgramPreinscriptosTab.tsx`, `whatsappPreinscripto.ts`)
- Deudores (`DeudoresTab.tsx`), cuenta corriente (`CuentaPublicLinkDialog.tsx`), cumpleaños (`BirthdayWidget.tsx`)
- Reservas de viajes y lista de espera (`AdminEventReservations.tsx`, `AdminEventWaitlist.tsx`)
- Turnera (`TurneraComunicacionesCell.tsx`, `whatsappReminderTemplates.ts`)
- Depósito y camioneta (`DeliveryClientNotify.tsx`, `camionetaAviso.ts`, `DepositoCamioneta/Pedidos`)
- Grupos (`WhatsAppGrupoTareas.tsx`, `whatsappGroupSync.ts`, `CoachChequeoAlumnos.tsx`)
- `/admin/comunicaciones?tab=whatsapp` (conciliador) y `/admin/whatsapp-historial`
- Botones de contacto en páginas públicas (`contactInfo.ts`)
- Normalización de teléfonos: `phoneNormalize.ts` y una copia propia en `register-whatsapp-contact`

## 2. Recomendación: Twilio o Meta directo

Recomiendo **el conector directo WhatsApp Business (Meta)**, no Twilio:
- El receptor y las tablas ya están hechos para el formato de Meta.
- No cobra un costo extra por mensaje como Twilio.
- Las plantillas se gestionan desde la app.
- Las respuestas dentro de las 24 h son gratis.

Twilio solo tiene a favor el código de recordatorios ya escrito, pero nunca se probó y sería fácil de adaptar.

**Limitación a validar:** en este tipo de proyecto, la recepción de mensajes por el conector requiere la versión moderna de la plataforma. Hay dos caminos:
- **(a)** Usar el webhook propio `whatsapp-webhook` con una app de Meta propia: requiere `WHATSAPP_VERIFY_TOKEN` y `META_APP_SECRET`.
- **(b)** Migrar el proyecto.

Hay que decidirlo antes de la Etapa 3.

## 3. Arquitectura mínima

```text
Evento en la app (pago, reserva, link) -> cola whatsapp_outbox (idempotency_key)
   -> función send-whatsapp (de a uno, plantilla aprobada) -> proveedor
   -> estado queued / sent / delivered / read / failed (por callback real)
Mensaje entrante -> whatsapp-webhook (firma obligatoria) -> whatsapp_messages
   -> reglas simples (palabras clave / menú) -> respuesta automática en 24 h
   -> sin coincidencia o pide humano -> whatsapp_pending_tasks + aviso admin
Bandeja admin (/admin/whatsapp-historial) para leer, responder y cerrar casos
```

## 4. Plan por etapas

1. **Credenciales:** conectar WhatsApp Business. Hacer obligatoria la firma en el webhook (rechazar si falta el secreto) y cargar los secretos. Probar con el número propio.
2. **Plantillas:** crear plantillas UTILITY (link de pago, recordatorio de turno, preinscripción) y esperar la aprobación de Meta (hasta 48 h).
3. **Envío transaccional:** una tabla de salida con clave de idempotencia y una función de envío de a uno, solo para admin y tareas programadas. Un mensaje solo se marca "enviado" cuando el proveedor lo confirma. Empezar por los recordatorios de Turnera.
4. **Entrantes y bandeja:** activar el receptor, armar la bandeja con respuesta manual y asignar conversaciones a alumnos por teléfono normalizado.
5. **Respuestas automáticas simples:** horarios, sedes, link de pago; con IA opcional y siempre con opción de derivar.
6. **Derivación a humano y trazabilidad:** tareas pendientes, auditoría y métricas.

## Decisiones que necesito de vos

- ¿Meta directo (recomendado) o Twilio?
- ¿Qué número va a usar el negocio, y ya está en la app WhatsApp Business?
- Para recibir mensajes: ¿webhook propio con app de Meta propia, o migrar el proyecto?
