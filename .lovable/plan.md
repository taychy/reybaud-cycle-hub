## Objetivo

Un externo que ve la landing pública de un evento (viaje, carrera, salida) puede reservar y pagar **sin crear cuenta de alumno**. Al confirmarse el pago recibe un magic link con acceso a una vista limitada donde solo ve/gestiona **su evento**: estado, checklist, roommate, documentos. Nunca ve entrenamientos, planes, ni el resto de la app.

Aplica a **todos los eventos abiertos** (viajes, carreras, salidas one-shot). Si en el futuro querés restringirlo por evento, agregamos el toggle en admin — pero de arranque queda universal.

## 1. Landing pública (`/eventos/:id`)

Reemplazo el CTA único de "Iniciar sesión" por **dos botones lado a lado** cuando el visitante no está logueado:

- **Soy alumno** → login flujo actual (`/?returnTo=…`).
- **Reservar como invitado** → abre nuevo `GuestReservationDrawer` (checkout completo sin cuenta).

Si ya hay `alumno` en sesión, sigue viéndose el CTA único actual — sin cambios.

## 2. Checkout de invitado (`GuestReservationDrawer`)

Wizard corto de 3 pasos, mismo look que el drawer actual pero sin dependencia de `alumno`:

1. **Datos personales**: nombre, apellido, email, teléfono, documento, fecha de nacimiento, contacto de emergencia (nombre + tel).
2. **Paquete + extras**: mismos componentes que hoy usa el alumno logueado (`PackageSelector`, `AddonsSelector`), reutilizados.
3. **Pago**: MP o transferencia (mismo flujo que reservas de alumnos).

Al enviar, invoca una nueva edge function **`create-guest-reservation`** que:

- Crea (o actualiza si ya existe por email) una fila en `event_external_participants` con todos los datos personales — **no toca `alumnos`**.
- Crea `event_reservations` con `alumno_id = NULL` y `external_participant_id = <id>` (agrego esa columna).
- Aplica el mismo flujo de pago que la reserva de alumno (MP preference / upload de comprobante) — reutiliza `resolveCuentaMP` y el bucket `payment-proofs`.
- Genera un token único (`event_external_participants.access_token`, ya existe) para el acceso post-pago.

Con esto, el externo queda separado del padrón de alumnos y no ensucia métricas de retención/MRR.

## 3. Confirmación por email + magic link

Al aprobarse el pago (MP webhook aprobado o admin valida transferencia), se dispara **`send-guest-reservation-confirmed`**:

- Encola email con resumen del paquete, monto pagado, fecha del evento y un **botón "Acceder a tu reserva"** que apunta a `https://reybaud-app.com/mi-reserva/:token`.
- El token es el mismo `access_token` de `event_external_participants` — no requiere que el guest haga login.

Los recordatorios de cuotas, cambios de estado y avisos generales del viaje reutilizan la infra existente (`reservation_notifications`), pero apuntando al link con token en lugar de a la app de alumno.

## 4. Mini-app post-pago (`/mi-reserva/:token`)

Nueva ruta pública (sin `ProtectedRoute`) que valida el token y muestra **solo** lo que corresponde a esa reserva:

- Header: evento, fechas, paquete contratado, estado de pago.
- Tabs:
  - **Detalles del viaje** — descripción, itinerario, inclusiones (mismo componente readonly que ya existe).
  - **Mi reserva** — comprobante, cuotas pendientes, botón "Pagar cuota siguiente" (MP link generado con el mismo token).
  - **Checklist** — bike sizing, documentos, formularios (reutilizo el `ReservationChecklist` actual, adaptado para trabajar con `external_participant_id` en vez de `alumno_id`).
  - **Roommate** — puede elegir compartir habitación con otro participante externo o pedir asignación admin.
- **No hay**: entrenamientos, planes, cuenta corriente, otros eventos, tienda, comunidad.

Diseño limpio, respeta el look luxury dark existente pero sin `BottomNav` de alumno.

## 5. Admin sigue viendo todo unificado

- El panel actual de reservas (`AdminEventReservations` + `EventTripReports`) ya muestra participantes externos con badge — se mantiene igual.
- Agrego columna extra: "Origen" (alumno / externo directo) para distinguir los que se anotaron por landing pública de los que fueron agregados como acompañantes por un alumno.
- El botón "Convertir a alumno" (opcional) queda disponible por si un externo después decide sumarse a un plan mensual — reutiliza la RPC `merge_alumnos` de la iteración anterior.

## 6. Detalles técnicos

**Migraciones:**
- `event_reservations.external_participant_id uuid REFERENCES event_external_participants(id)` (nullable).
- `event_external_participants`: verificar que tenga `documento`, `fecha_nacimiento`, `contacto_emergencia_nombre`, `contacto_emergencia_telefono` (agregar los que falten).
- RLS pública sobre `event_reservations`, `reservation_installments`, `reservation_checklist_data`, `event_room_assignments`: policy `SELECT/UPDATE` cuando el request trae header con token válido (usar `check_external_participant_token(token)` SECURITY DEFINER que ya existe o se crea).
- `event_external_participants`: mismo patrón — RLS que permite SELECT/UPDATE por token.

**Edge functions nuevas:**
- `create-guest-reservation` (POST público, sin JWT).
- `send-guest-reservation-confirmed` (invocado desde webhook MP y desde admin al validar transferencia).
- `guest-reservation-pay-installment` (POST público, genera MP preference para una cuota específica validando el token).

**Archivos nuevos:**
- `src/pages/GuestReservationView.tsx` — mini-app post-pago.
- `src/components/reservation/GuestReservationDrawer.tsx` — wizard de checkout.
- `src/App.tsx` — nueva ruta `/mi-reserva/:token`.
- `src/pages/EventDetail.tsx` — dos CTAs cuando no hay alumno.

**Reutilización:**
- `PackageSelector`, `AddonsSelector`, `ReservationChecklist`, `TripRoommatesDrawer` — refactor mínimo para aceptar `external_participant_id` como alternativa a `alumno_id`.
- Flujo de pago MP y transferencia — mismos handlers que reservas de alumno.

**Fuera de alcance de esta iteración (podemos hacer después si querés):**
- Toggle por evento para desactivar el flujo de externos.
- UI de admin para "invitar por link" a un externo específico.
- Recuperación de acceso si el guest pierde el email (self-service reenvío de magic link por email).

## 7. Caso de uso validador

Al terminar, un amigo de un alumno que quiere ir a Girona 2027:
1. Entra a `reybaud-app.com/eventos/girona-2027`.
2. Ve fotos, precios, itinerario. Toca "Reservar como invitado".
3. Llena sus datos + elige paquete "Doble" + paga con MP.
4. Recibe email "Reserva confirmada" con link `/mi-reserva/abc123`.
5. Entra al link → ve su paquete, sube su pasaporte, elige roommate. Nunca vio la app de alumnos ni tuvo que registrarse.
