## Plan de pagos por paquete + recordatorios automáticos (v2 consolidado)

Sí, exacto: este plan combina mi propuesta original con **todas** tus modificaciones. Nada quedó afuera.

---

### 1. Modelo de datos

#### 1.1 Templates (admin) — con versionado

**`event_package_payment_plans`** (template + versiones archivadas por paquete)
- `id`, `package_id`, `nombre`
- `version` int (autoincrement por package_id)
- `archived_at` timestamptz null
- `sena_tipo` enum (`monto_fijo`, `porcentaje_paquete`)
- `sena_valor` numeric
- `sena_vence_dias` int default 0
- `cantidad_cuotas` int
- `last_installment_absorbs_rounding` bool default true
- `regla_reserva_tardia` enum (`cobrar_al_reservar`, `reprogramar_a_hoy`, `mantener_fechas_fijas`) default `cobrar_al_reservar`
- `activo` bool

**`event_package_payment_plan_installments`** (definición de cada cuota del template)
- `plan_id`, `numero`, `descripcion`
- `monto_tipo` enum (`fijo`, `porcentaje_saldo`)
- `monto_valor` numeric
- `fecha_vencimiento` date
- `reminders_config` jsonb (offsets, heredado del tipo por default)

#### 1.2 Instancia (reserva) — con snapshot inmutable

**Columnas nuevas en `event_reservations`**:
- `payment_plan_id` FK (versión usada)
- `payment_plan_name_snapshot` text
- `payment_plan_snapshot` jsonb (copia inmutable del plan + cuotas al confirmar)

**Columnas nuevas en `reservation_installments`**:
- `installment_type` enum (`sena`, `cuota`) default `cuota`
- `monto_original`, `monto_pagado`, `saldo_pendiente` numeric
- `due_date_original` date
- `reprogramada_por` uuid, `reprogramada_at` timestamptz
- Estados soportados: `pendiente, parcial, pagada, vencida, cancelada, condonada, reprogramada`

**`reservation_installment_reminders`** (auditoría técnica, tabla relacional propia)
- `reservation_installment_id`, `offset_days`, `channel` (`email`/`whatsapp_manual`/`admin_alert`), `recipient_type` (`alumno`/`admin`), `recipient_email`, `status` (`pending`/`sent`/`failed`/`skipped`), `sent_at`, `error_message`
- `idempotency_key` text **UNIQUE**

`reservation_notifications` queda como timeline visible alumno/admin (sin cambios).

#### 1.3 Config de alertas admin (configurable por evento)

- Columna nueva `events.admin_alert_emails` text[] (lista por evento).
- `app_config` clave `default_payment_alert_emails` text[] (fallback global).

---

### 2. Materialización al confirmar reserva

1. Leer plan activo del paquete.
2. **Calcular sobre precio final congelado** de la reserva (no precio actual del paquete).
3. Seña = según `sena_tipo`/`sena_valor` sobre precio final.
4. Saldo = precio final − seña.
5. Cuotas = según `monto_tipo`/`monto_valor` sobre saldo. Última absorbe redondeo si flag activa.
6. **Validar obligatoriamente**: `seña + Σ cuotas == precio_final` (tolerancia 1 centavo). Si falla → abortar.
7. Aplicar `regla_reserva_tardia`:
   - `cobrar_al_reservar` (default viajes): cuotas con `fecha < hoy` se consolidan en la seña. Solo se materializan cuotas futuras.
   - `reprogramar_a_hoy`: vencidas se mueven a hoy, conservando `due_date_original`.
   - `mantener_fechas_fijas`: se crean igual (nacen vencidas).
8. Insertar `event_reservations` con snapshot + cuotas en `reservation_installments` (seña como `installment_type='sena'`, numero=0; resto `cuota`).

**Regla absoluta:** una cuota nunca puede nacer vencida (salvo modo explícito `mantener_fechas_fijas`).

---

### 3. Editor admin (UI)

En `EventPackagesEditor.tsx`, sección **"Plan de pagos"** por paquete:

- Switch "Tiene plan de cuotas".
- Inputs seña: tipo (monto / % paquete) + valor + días para vencer.
- Cantidad de cuotas + botón "Generar cuotas mensuales".
- Tabla editable: # / descripción / tipo monto / valor / fecha vencimiento / chips de recordatorios.
- Select "Regla para reservas tardías".
- **Vista previa en vivo** con precio del paquete: muestra seña + cuotas + total. Resalta en rojo si no cuadra y bloquea guardar.
- Al guardar cambios sobre un plan con reservas existentes → confirmación + **nueva versión** (archiva la anterior). Reservas viejas siguen apuntando a su versión vía snapshot.

---

### 4. Precio "desde" en listados

- `Eventos.tsx` + `EventCard`: `min(precio)` de paquetes activos → "Training Camp San Luis · desde $XXX".
- `EventDetail.tsx`: al elegir paquete en el drawer, mostrar desglose seña + N cuotas con fechas y montos exactos (mismo cálculo que materialización).

---

### 5. Cron diario de recordatorios

`process-installment-reminders` edge function, cron diario **08:00 ART (11:00 UTC)** vía pg_cron + pg_net.

| Tipo cuota | Offsets |
|---|---|
| Seña | 0, +1, +3 |
| Cuota regular | -7, -2, 0, +3, +7 |
| Última cuota | -14, -7, -2, 0, +3, +7 |

Reglas:
- `pagada / cancelada / condonada` → skip (registrado como `skipped`).
- `parcial` → mensaje muestra **saldo pendiente**, no monto original.
- Idempotencia: `inst-{id}-off{offset}-{channel}-{recipient}` UNIQUE en `reservation_installment_reminders`.

#### Alertas admin
- Día 0 ("vence hoy"): email individual a `events.admin_alert_emails` ∪ fallback global.
- Vencidas (+3, +7): **digest diario por evento** agregado (no un email por cuota).
- Nunca a todos los admins.

#### Templates email nuevos
- `installment-upcoming.tsx`
- `installment-due-today.tsx`
- `installment-overdue.tsx`
- `admin-installment-digest.tsx`

---

### 6. WhatsApp etapa 1 (manual)

`whatsappReminderTemplates.ts` con plantillas (próxima/hoy/vencida/parcial). Botón en admin → `wa.me/{telefono}?text={mensaje}`. Sin proveedor por ahora.

---

### 7. Vista alumno

`StudentInstallmentsPlan.tsx`:
- Etiqueta "Seña" para `installment_type='sena'`.
- Mostrar saldo pendiente si parcial.
- Badge "Reprogramada" con tooltip mostrando `due_date_original`.

---

### 8. Archivos

**Migración** (única): tablas nuevas + columnas + ampliar enum estado + cron + GRANT/RLS.

**Nuevos:**
- `src/components/admin/PackagePaymentPlanEditor.tsx`
- `src/lib/paymentPlanCalculator.ts` (cálculo seña/cuotas + validación + reservas tardías)
- `src/lib/whatsappReminderTemplates.ts`
- `supabase/functions/process-installment-reminders/index.ts`
- 4 templates email + registry

**Modificados:**
- `EventPackagesEditor.tsx`, `EventForm.tsx` (admin_alert_emails)
- `ReservationDrawer.tsx` (materialización + snapshot + regla tardía)
- `Eventos.tsx`, `EventDetail.tsx` (precio "desde" + desglose en drawer)
- `StudentInstallmentsPlan.tsx` (seña + reprogramación + parcial)
- `EventManagement.tsx` (botones WA)

---

### Orden de ejecución

1. Migración (requiere tu aprobación aparte).
2. `paymentPlanCalculator.ts` + tests básicos del cálculo.
3. Editor admin (`PackagePaymentPlanEditor` + integración en `EventPackagesEditor`).
4. Precio "desde" en listados + desglose en drawer.
5. Materialización en `ReservationDrawer` (snapshot + reserva tardía).
6. Templates email + cron + edge function.
7. WhatsApp manual + ajustes vista alumno.

¿Confirmás y arranco con la migración?
