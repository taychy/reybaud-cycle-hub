
# Reglamento y condiciones del evento

## 1. Datos en el evento (admin)

Nuevo bloque **"Reglamento y condiciones"** en `EventManagement.tsx`, guardado dentro de `events.metadata` (JSONB, sin migración de schema):

- `politica_sena` (textarea)
- `politica_cancelacion` (textarea)
- `politica_pagos` (textarea)
- `reglamento_texto` (textarea larga)
- `reglamento_url` (ya existe como `reglamento`) — PDF opcional
- `terminos_version` (string, se autoincrementa cuando admin guarda cambios) — para auditoría

**Precarga automática** al crear/editar un evento cuya categoría sea `viaje` o `camp` (y los campos estén vacíos): se inyectan los textos default de Training Camp / viajes. Editables y borrables. Para otras categorías los campos quedan vacíos.

Default sugerido (editable):
- **Seña**: "La seña confirma tu lugar y no es reembolsable. Se descuenta del total del paquete."
- **Cancelación**: "Hasta 30 días antes del evento: devolución del saldo abonado (la seña no se reintegra). Entre 30 y 15 días: 50% del saldo. Menos de 15 días o no presentarse: sin devolución."
- **Pagos**: "El saldo puede abonarse en cuotas según el plan elegido. Última cuota vence 7 días antes del inicio del evento."
- **Reglamento**: texto base con horarios, equipamiento obligatorio (casco), comportamiento, responsabilidad del participante, etc.

## 2. Componente reutilizable

`src/components/event/EventReglamentoSection.tsx`:

- Accordion shadcn con header **"Reglamento y condiciones"** + ícono `FileText`.
- Subsecciones (colapsadas, ocultas si vacías): Seña, Cancelación, Pagos, Reglamento, Descargar PDF.
- Render seguro con `whitespace-pre-line`.

## 3. Dónde se muestra

- **App – `EventDetail.tsx`**: insertar antes del bloque de links externos.
- **Página pública del evento** (`PublicPreorderPage` o equivalente).
- **Flujo de reserva (`ReservationDrawer.tsx`)** paso de confirmación:
  - Sección colapsable con el reglamento.
  - **Checkbox obligatorio** "He leído y acepto el reglamento y políticas del evento" — bloquea el botón "Confirmar reserva" si no está tildado.
- **Hub de viaje** del alumno: link "Ver reglamento y condiciones".

## 4. Auditoría de aceptación

Migración: agregar a `event_reservations`:
- `terminos_aceptados_at` (timestamptz)
- `terminos_version_aceptada` (text)
- `terminos_snapshot` (jsonb) — copia de los 4 textos al momento de la aceptación, por si después admin los modifica.

Al confirmar la reserva, se guardan estos 3 campos. Visible para admin en el detalle de la reserva ("Aceptó reglamento v3 el 20/06/2026 14:32").

## 5. Email automático post-reserva

Nuevo template `reservation-confirmation` (React Email) con:
- Saludo personalizado.
- **Resumen del paquete contratado**: nombre del paquete, precio total, seña pagada/pendiente, saldo, fecha del evento, fechas de cuotas.
- **Reglamento y políticas** completos (las 4 secciones + reglamento) embebidos en el cuerpo del mail.
- Link al hub del evento dentro de la app.
- Link al PDF si existe `reglamento_url`.

Se envía vía `send-transactional-email` desde el handler de confirmación de reserva (o como trigger después del insert en `event_reservations`), con `idempotencyKey = reservation-confirm-${reservation_id}` para que reintentos no dupliquen.

## Archivos

- **Migración**: 3 columnas nuevas en `event_reservations`.
- **Edge function template**: `supabase/functions/_shared/transactional-email-templates/reservation-confirmation.tsx` + registry.
- **Frontend**:
  - `src/components/event/EventReglamentoSection.tsx` (nuevo)
  - `src/lib/eventReglamentoDefaults.ts` (nuevo, textos default)
  - `src/pages/EventDetail.tsx`
  - `src/pages/PublicPreorderPage.tsx` (o vista pública correspondiente)
  - `src/components/admin/EventManagement.tsx` (form de carga + autoprecarga por categoría)
  - `src/components/reservation/ReservationDrawer.tsx` (checkbox obligatorio + persistir snapshot + disparar email)

## Confirmación

¿Avanzo con todo esto?
