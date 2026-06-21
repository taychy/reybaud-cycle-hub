# Reservas — Confirmación, Cobranza y Comunicaciones (v3 aprobado)

> Plan vigente. El plan anterior de "cambios de mercadería" ya está implementado y se archivó del documento.

## Objetivo
Cuando admin confirma una reserva, el cliente recibe email con cobranza (MP o aviso de efectivo), admin recibe notificaciones asíncronas trazables, y existe un panel de plantillas (fase 1 solo lectura). Todo con auditoría y antiduplicado a nivel DB.

---

## 1. Estados — separación estricta

**`event_reservations.reservation_status`** (estado operativo de la reserva):
- `pendiente` → `reserva_confirmada` → `cancelada`
- Nunca `pago_confirmado` (eso confunde con dinero acreditado).

**`event_reservations.payment_status`** (estado del dinero):
- `pendiente` | `pago_informado` | `efectivo_anunciado` | `pagado` | `pagado_parcial`

Validar transición en trigger DB. UI siempre muestra ambos chips por separado.

---

## 2. Confirmación de reserva + email con cobranza

### Trigger único de transición
- En `AdminEventReservations.tsx`, al marcar **"Confirmar reserva"** se ejecuta RPC `confirm_reservation(reservation_id)` que en **una sola transacción**:
  1. Verifica `reservation_status = 'pendiente'` (si ya está `reserva_confirmada`, sale sin reenviar).
  2. Cambia `reservation_status → 'reserva_confirmada'` y `confirmed_at = now()`.
  3. Inserta en `admin_notification_events` con `deduplication_key = "confirm:{reservation_id}"`.
  4. Marca `confirmation_payment_email_queued_at = now()`.
  5. Encola email a alumno/externo (cola `transactional_emails` vía `enqueue_email`).
  6. Audita `reserva.confirmada` + `reserva.confirmation_email.encolado`.

### Columnas nuevas en `event_reservations`
- `confirmation_payment_email_queued_at timestamptz`
- `confirmation_payment_email_sent_at timestamptz`
- `confirmation_payment_email_failed_at timestamptz`
- `confirmation_payment_email_attempts int default 0`

Re-confirmar no reencola (idempotente por `queued_at IS NOT NULL`). Botón "Reenviar email" explícito para admin si falla.

### Email enviado — `send-reservation-confirmed-with-payment`
- Asunto: *"Tu reserva fue confirmada — coordinemos la seña"*
- CTAs:
  - **"Pagar ahora con Mercado Pago"** → `/mis-reservas/:id?action=pay`
  - **"Voy a pagar en efectivo"** → `/mis-reservas/:id?action=cash`
  - "Ver mi reserva"

---

## 3. Cálculo backend — `importe_a_pagar_ahora(reservation_id)`

Función PL/pgSQL `SECURITY DEFINER` compartida por MP y efectivo:

1. Si hay seña pendiente (`reservation_installments.tipo='seña' AND balance_due>0`) → seña.
2. Si seña saldada → próxima cuota con `balance_due>0` por `due_date`.
3. `LEAST(monto_calculado, balance_due_total_reserva)`.
4. Retorna `{ amount, currency, concepto: 'seña'|'cuota_N'|'saldo', installment_number }`.

**Frontend nunca pasa `amount`.** Solo pasa `reservation_id`; backend resuelve.

---

## 4. Mercado Pago — antiduplicado con concurrencia

### Tabla `reservation_payment_intents`
```sql
- id uuid pk
- reservation_id uuid
- concepto text                  -- 'seña' | 'cuota_N' | 'saldo'
- amount numeric, currency text
- preference_id text, init_point text
- status text  -- 'pendiente' | 'aprobada' | 'expirada' | 'cancelada' | 'fallida'
- expires_at timestamptz default now() + interval '15 min'
- created_at, resolved_at
- created_by uuid, actor_type text
```

**UNIQUE parcial** garantiza un único intent vivo por concepto:
```sql
CREATE UNIQUE INDEX uq_active_intent
ON reservation_payment_intents (reservation_id, concepto, amount)
WHERE status = 'pendiente';
```

`create-event-mp-preference`:
1. Calcula `importe_a_pagar_ahora` en server.
2. Intenta `INSERT ... ON CONFLICT DO NOTHING`.
3. Si hubo conflicto → SELECT del intent vivo y devuelve mismo `init_point`. Audita `reserva.mp.intent.reutilizado`.
4. Si insertó → crea preference en MP y guarda `preference_id`/`init_point`.

`mp-webhook` al aprobar pago: `UPDATE intent SET status='aprobada', resolved_at=now()` por `preference_id`.

Cron `expire-stale-intents` cada 5 min: `pendiente AND expires_at < now()` → `expirada`.

---

## 5. Efectivo anunciado (NO es pago)

### Tabla `reservation_cash_announcements`
```sql
- id, reservation_id, alumno_id, external_participant_id
- amount, currency, concepto, installment_number    -- todo calculado en server
- nota_libre text, lugar_previsto text, fecha_limite date
- status text  -- 'anunciado' | 'cobrado' | 'rechazado' | 'vuelto_a_pendiente'
- payment_id uuid  -- FK a reservation_payments cuando se cobra
- created_at, resolved_at, resolved_by, actor_type
```

**UNIQUE parcial** — un solo anuncio activo por concepto:
```sql
CREATE UNIQUE INDEX uq_active_cash_announce
ON reservation_cash_announcements (reservation_id, concepto)
WHERE status = 'anunciado';
```

### Edge function `announce-cash-payment(reservation_id, nota, lugar, fecha_limite)`
- Backend calcula `importe_a_pagar_ahora`.
- Si ya existe anuncio activo para ese concepto → devuelve el existente y permite editar `nota/lugar/fecha_limite` (UPDATE, no INSERT).
- Si no existe → INSERT (UNIQUE protege contra carrera).
- Actualiza `event_reservations.payment_status = 'efectivo_anunciado'` (si no hay pago real ya).
- Audita `reserva.efectivo.anunciado`.

### Admin: acciones sobre anuncio
- **Cobrado** → RPC `mark_cash_collected(announcement_id, metodo, comprobante?)` atómica:
  - Crea `reservation_payments` con `metodo='efectivo'`.
  - `UPDATE announcement SET status='cobrado', payment_id=...`.
  - Recalcula `payment_status` reserva.
  - Audita `reserva.efectivo.cobrado` con `payment_id`.
- **Rechazado** → `status='rechazado'`, motivo.
- **Vuelto a pendiente** → `status='vuelto_a_pendiente'`. Audita.

### UI alumno — `ReportPaymentDrawer` rediseñado
Dos bloques visualmente separados (colores y copys distintos):
- 🟢 **"Ya pagué"** — transferencia/depósito/MP fuera de la app. Crea `pago_informado`.
- 🟡 **"Voy a pagar en efectivo"** — banner amarillo aclaratorio: *"Esto NO acredita el pago. Es solo un aviso al admin."* Si ya hay anuncio activo, lo muestra y permite editar nota/lugar.

---

## 6. Notificaciones admin — asíncronas con bitácora

### Tabla `admin_notification_events`
```sql
- id, tipo, reservation_id, payload jsonb
- destinatarios text[]
- prioridad text  -- 'pago' | 'efectivo' | 'checklist_critico' | 'checklist_general'
- status text  -- 'pendiente' | 'enviado' | 'fallido'
- intentos int default 0, last_error text
- deduplication_key text UNIQUE
- created_at, sent_at
```

### Patrón
- Acción de usuario hace **solo INSERT** y devuelve OK (no espera email). Si el INSERT falla, no rompe el flujo principal (try/catch silent + audit).
- Cron cada 1 min `process-admin-notifications`:
  - Lee `pendiente OR (fallido AND intentos<5)`.
  - Filtra destinatarios según `admin_profiles.notification_prefs`.
  - Envía vía `notify-reservation`.
  - Actualiza status. Audita `admin_notification.enviada|.fallida` con intento N.
- Botón "Reintentar" manual en UI admin para fallidos.
- Emails incluyen link directo `https://reybaud-app.com/admin/reservas/:id`.

### Niveles (en `admin_profiles.notification_prefs jsonb`)
```json
{
  "pagos": true,                  // siempre default true (pago_informado, mp aprobado)
  "efectivo_anunciado": true,     // default true
  "checklist_critico": true,      // documentación, seguro, transporte, apto médico
  "checklist_general": false      // resto, silenciado por default
}
```

Catálogo de items `checklist_critico` se mantiene en constante server (no manipulable por cliente).

### Deduplicación checklist
`deduplication_key = "checklist:{reservation_id}:{item}:{step}"`. Marcar/desmarcar repetido no genera nueva entry. Solo el primer "completado" envía.

---

## 7. Links seguros `/mis-reservas/:id`

`ReservationView` valida en server (RPC `get_my_reservation(id)`):
- `auth.uid()` matches `alumnos.user_id` de la reserva, **O**
- Token externo válido en `event_external_participants`.

Sin match → 403. **No** confiar en obscuridad del UUID. Patrón ya usado en `tripTokenApi.ts`.

---

## 8. Panel de plantillas — Fase 1 (solo lectura)

Ruta `/admin/comunicaciones/plantillas` (acceso `admin`):
- Tabla con columnas: `key`, `asunto`, `descripción`, `evento que dispara`, `destinatarios`, botón "Vista previa".
- Preview renderiza HTML con `previewData` mockeado por plantilla.
- Botón "Solicitar cambio" → inserta en `mejoras_sugeridas`.

Plantillas catalogadas (registry server):
- `reservation_confirmed_with_payment`
- `reservation_payment_reported`
- `reservation_cash_announced`
- `reservation_cash_collected`
- `reservation_checklist_critical_progress`
- `reservation_installment_due`
- `reservation_announcement`

### Tab "Configuración" — solo `super_admin`
- Editor de `app_config.admin_notification_emails text[]`.
- Botón "Enviar email de prueba" → `admin-test-email`. Si falla, warning sin bloquear nada.

### Permisos `app_config.admin_notification_emails`
- `super_admin`: SELECT/UPDATE valor completo.
- `admin`: SELECT vía RPC `get_admin_notification_emails_masked()` que devuelve solo `{ count, masked: ["a***@d.com", ...] }`.
- RLS en tabla solo permite `super_admin` para esa clave.

**Fase 2 (NO ahora, documentado):**
- Editor restringido a `super_admin`, tabla `email_templates_admin` con versionado.
- Validación de variables permitidas por plantilla (whitelist).
- Preview en vivo, restaurar versión anterior, historial completo.

---

## 9. Auditoría (`audit_log`)

Cada evento registra `actor_id`, `actor_type` (`alumno` | `participante_externo` | `admin` | `edge_function`), `reservation_id`, `payload`:

- `reserva.confirmada`
- `reserva.confirmation_email.encolado`
- `reserva.confirmation_email.enviado` / `.fallido` (con intento N)
- `reserva.mp.preference.creada` (preference_id, amount, concepto)
- `reserva.mp.intent.reutilizado` (intent_id existente)
- `reserva.mp.pago.aprobado` (desde webhook)
- `reserva.efectivo.anunciado`
- `reserva.efectivo.cobrado` (con `payment_id` real)
- `reserva.efectivo.rechazado`
- `reserva.efectivo.vuelto_a_pendiente`
- `reserva.pago.acreditado`
- `admin_notification.enviada` / `.fallida` (intento N)

---

## 10. Fuera de scope (queda para implementación separada)

**Módulo "Coordinador de camp"** — reusa las fuentes de datos creadas acá:
- Cuotas vencidas (de `reservation_installments`).
- Efectivo anunciado activo (de `reservation_cash_announcements`).
- Saldo pendiente (de `event_reservations.balance_due`).
- Checklist crítico incompleto (de `reservation_checklist_data` filtrado).
- Última actividad del participante (de `audit_log`).
- Semáforo + alertas cada 3 días vía cron separado.

---

## Detalles técnicos

### Migraciones (orden)
1. Renombrar/ampliar enums: `reservation_status` (sin `pago_confirmado`), `payment_status` agregar `efectivo_anunciado`.
2. `event_reservations` + 4 columnas de email tracking.
3. Tabla `reservation_payment_intents` + UNIQUE parcial + grants + RLS.
4. Tabla `reservation_cash_announcements` + UNIQUE parcial + grants + RLS.
5. Tabla `admin_notification_events` + grants + RLS + índice `status, prioridad`.
6. `admin_profiles.notification_prefs jsonb default '{...}'::jsonb`.
7. Función `importe_a_pagar_ahora(uuid)` SECURITY DEFINER.
8. RPCs: `confirm_reservation`, `announce_cash_payment`, `mark_cash_collected`, `get_my_reservation`, `get_admin_notification_emails_masked`.
9. `app_config` upsert clave + policies por clave.
10. pg_cron: `process-admin-notifications` (1 min), `expire-stale-intents` (5 min).

### Edge functions
**Nuevas:**
- `send-reservation-confirmed-with-payment` (template react-email).
- `process-admin-notifications` (cron worker).
- `expire-stale-intents` (cron worker).
- `admin-test-email`.
- `announce-cash-payment` (wrapper RPC para auditar actor).

**Modificadas:**
- `create-event-mp-preference`: usar `importe_a_pagar_ahora` + intent table.
- `mp-webhook`: cerrar intent al aprobar.
- `notify-reservation`: aceptar `deduplication_key`, devolver `notification_id`.

### Frontend
- `AdminEventReservations.tsx`: botón "Confirmar reserva" → RPC, sección "Efectivos anunciados", botón "Reintentar notificación" para fallidos, "Reenviar email" para fallidos.
- `ReportPaymentDrawer.tsx`: dos secciones visualmente separadas.
- Nueva página `src/pages/admin/AdminEmailTemplates.tsx` (fase 1).
- Entrada sidebar admin "Comunicaciones".
- `MisReservas`: query param `?action=pay|cash`.

### Orden de ejecución
1. Migraciones 1-9.
2. Edge functions backend + cron.
3. Frontend admin (confirm + efectivos + reintentos).
4. Frontend alumno (drawer + acción cash/pay vía URL).
5. Panel plantillas fase 1.
6. Test de envío + validación end-to-end.

---

¿Avanzo con migración + backend primero?
