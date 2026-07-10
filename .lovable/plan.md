# Turnera — Entrega 1 y 3: Pago obligatorio, Transferencia con comprobante y Google Calendar

## Objetivo
El turno **solo se confirma con el pago**. Cliente elige entre MP (tarjeta/wallet) o Transferencia. Los turnos confirmados se sincronizan al Google Calendar "Clases" de Natalia y se avisa por email al profesor (con .ics de respaldo).

---

## Entrega 1 — Pago obligatorio + Slot Hold + Transferencia

### 1.1 Base de datos (`reservas_turnera`)
Nuevas columnas:
- `estado_pago` — `pendiente_mp | pendiente_transferencia | comprobante_subido | aprobado | expirado | rechazado`
- `metodo_pago` — `mp | transferencia`
- `hold_expira_at` — 15 min si MP, 2 h si transferencia
- `comprobante_url`, `comprobante_subido_at`, `verificado_por`, `verificado_at`, `motivo_rechazo`
- `upload_token uuid` — token único para acceder al flujo desde el email
- `recordatorio_15min_enviado_at`, `email_expiracion_enviado_at` (idempotencia)

Backfill de reservas existentes: las que tienen `pagado=true` → `aprobado`; el resto → `aprobado` (legacy, no romper histórico).

### 1.2 Storage
Bucket **`turnera-comprobantes`** privado. RLS: cliente sube con `upload_token`; admin lee todo.

### 1.3 Config bancaria (`app_config`)
Claves nuevas para transferencia: `turnera_cbu`, `turnera_alias`, `turnera_titular`, `turnera_cuit`. Editables desde el panel admin (carga inicial pendiente — te pido los datos al aprobar el plan).

### 1.4 Flujo cliente — MP
1. Elige slot → botón **"Pagar con tarjeta o Mercado Pago"** con subtítulo *"Podés pagar con tarjeta de crédito o débito sin tener cuenta de Mercado Pago"*.
2. Se crea la reserva con `estado_pago='pendiente_mp'`, `hold_expira_at = now + 15min`.
3. Redirect a MP. Webhook confirma → `aprobado` + dispara sync a Calendar.
4. Si no paga en 15 min, cron marca `expirado` y libera el slot.

### 1.5 Flujo cliente — Transferencia
1. Elige slot → botón **"Transferencia bancaria"**.
2. Se crea reserva con `estado_pago='pendiente_transferencia'`, `hold_expira_at = now + 2h`, `upload_token` generado.
3. **Misma pantalla** muestra:
   - Datos bancarios (CBU/Alias/Titular/CUIT), monto exacto, concepto sugerido (nro. de reserva).
   - Countdown de 2 h.
   - **Botón "Cargar comprobante"** (upload directo).
   - Nota: *"También te enviamos un email con este link por si necesitás terminar el pago desde otro dispositivo"*.
4. Email automático **`turnera-transferencia-instrucciones`** con los mismos datos + botón CTA a `/reservar/:id/transferencia?token=...` (por si cierra la app).
5. Cliente sube comprobante → `estado_pago='comprobante_subido'`. Se congela el hold. Se avisa por email al admin.
6. Cron entre 10-20 min antes de expirar (si aún `pendiente_transferencia`) → email **`turnera-transferencia-recordatorio-15min`** (una sola vez, marca `recordatorio_15min_enviado_at`).
7. Si expira sin comprobante: `expirado`, libera slot, email **`turnera-transferencia-expirada`** con CTA "Volver a reservar" (una sola vez, marca `email_expiracion_enviado_at`).

### 1.6 Panel admin — "Turnera / Transferencias por validar"
Lista de reservas con `estado_pago='comprobante_subido'`:
- Ver comprobante (signed URL).
- Botones **Aprobar** / **Rechazar** (con motivo).
- Aprobar → `aprobado`, email al cliente, dispara sync a Calendar + email al profesor.
- Rechazar → `rechazado`, email al cliente con motivo y CTA volver a reservar.

### 1.7 Cron `expire-turnera-holds` (pg_cron cada 5 min)
En una sola pasada:
- Marca `expirado` las reservas cuyo `hold_expira_at < now()` y estado en (`pendiente_mp`, `pendiente_transferencia`).
- Dispara recordatorios 15 min (ventana 10-20 min antes).
- Dispara emails de expiración (una vez).

### 1.8 Emails nuevos (React Email)
- `turnera-transferencia-instrucciones`
- `turnera-transferencia-recordatorio-15min`
- `turnera-transferencia-expirada`
- `turnera-transferencia-aprobada`
- `turnera-transferencia-rechazada`
- `turnera-admin-nuevo-comprobante` (a admin)

---

## Entrega 3 — Google Calendar + email profesor

### 3.1 Conexión
Conectar cuenta **natalia@ciclismoreybaud.com** vía connector Google Calendar (OAuth builder-side, un solo usuario). Guardar `google_calendar_clases_id` en `app_config`.

### 3.2 Edge function `turnera-calendar-sync`
Se dispara desde:
- Webhook MP al aprobar pago.
- Admin al aprobar comprobante de transferencia.

Hace `POST /calendars/{clases_id}/events` con:
- Título: `{servicio} — {alumno}`
- Fecha/hora, ubicación (sede), coach como `attendee`.
- `extendedProperties.private.reserva_id` para idempotencia (upsert por búsqueda previa).
- Si cancelación/rechazo → `DELETE` del evento.

### 3.3 Email al profesor con .ics
Reutilizar `turnera-ics` + `send-turnera-email` existentes como respaldo (siempre se envía, aun si Calendar falla).

---

## Fuera de alcance (queda para v2)
- Validación semi-automática de transferencia por matcheo de monto/CBU.
- Notificaciones WhatsApp.
- Reintentos múltiples del email de expiración.

---

## Detalles técnicos
- **Idempotencia**: `reserva_id` en `extendedProperties` del evento; timestamps `*_enviado_at` en cada email.
- **RLS**: `turnera-comprobantes` con policy por `upload_token` para subida pública, lectura admin.
- **Compatibilidad**: reservas legacy siguen accesibles; solo las nuevas exigen pago.
- **Timezone**: usar el patrón del proyecto (split de string, no `new Date(...)` directo).

---

## Preguntas antes de ejecutar (necesito respuesta para arrancar)
1. **Datos bancarios**: ¿me los pasás ahora o los cargás vos desde el admin después de que despliegue?
2. **Calendar "Clases"**: ¿ya existe en la cuenta de Natalia o lo creo por API la primera vez?
3. **Backfill**: confirmo que reservas viejas quedan como `aprobado` (no rompe histórico) — ¿ok?
