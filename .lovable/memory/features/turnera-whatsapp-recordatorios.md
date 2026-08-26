---
name: Turnera WhatsApp Recordatorios
description: Canal WhatsApp de recordatorios de turnera (alumno y coach) vía Twilio gateway, desactivado por defecto; bitácora turnera_notificaciones por reserva+tipo+canal
type: feature
---

- Los recordatorios de Turnera tienen dos canales independientes por tipo (alumno / coach): Email y WhatsApp. WhatsApp nunca bloquea el email ni la reserva.
- Toggles por servicio: `servicios_turnera.whatsapp_recordatorio_enabled` y `whatsapp_coach_recordatorio_enabled` (default **false**).
- Teléfono del coach: `coaches.whatsapp` (editable en Gestionar Coaches). Alumno: `celular` de la reserva.
- Bitácora única: `turnera_notificaciones` (reserva_id + tipo + canal, UNIQUE `idempotency_key` = `turnera-{tipo}-{canal}-{reservaId}`). Estados: `scheduled`, `queued`, `sent`, `error`, `skipped`.
- **Nunca marcar `sent` sin confirmación real**: email pasa a `queued` al encolarse y sólo a `sent` cuando `email_send_log` lo confirma (reconciliación en el worker). WhatsApp: `queued` = aceptado por Twilio.
- Envío sólo con plantilla aprobada: requiere `LOVABLE_API_KEY`, `TWILIO_API_KEY` (conector vinculado), `TWILIO_WHATSAPP_FROM` y el ContentSid en `app_config` (`turnera_wa_content_sid_alumno_recordatorio` / `turnera_wa_content_sid_coach_recordatorio`). Falta alguno → `skipped` "No configurado", sin envío. Nunca texto libre en automatizaciones.
- Un solo cron: `process-turnera-reminders` decide email y WhatsApp por separado. Prohibido catch-up histórico o reenvíos masivos.
- La cuenta Twilio conectada es **Trial** (error 20003: Content API no disponible) → WhatsApp productivo no operativo hasta upgrade + plantillas aprobadas.
- `normalizeAlumnoForBooking` (BookingFlow) NO reinterpreta nombre/apellido: usa la ficha tal cual.
