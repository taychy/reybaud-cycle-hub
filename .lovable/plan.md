# Auditoría (solo lectura): reservas de eventos sin paquete

## Resultado por causa

### 1) Causa de despliegue (migración no aplicada) — CORREGIDA
La migración `20260819170000_sync_room_package_consistency.sql` está efectivamente aplicada en la base:
- Existen `sync_reservation_package_from_room` y `enforce_event_room_package_consistency`.
- El trigger `trg_event_room_package_consistency` está activo (`tgenabled = O`) sobre `event_room_assignments`.
- El backfill corrió: hoy no queda ninguna reserva con `package_id NULL` asignada a una habitación con paquete.

### 2) Causa estructural habitación↔paquete — CORREGIDA
El trigger cubre los tres escenarios:
- Reserva sin paquete + habitación con paquete → hereda paquete y precio del stage vigente a la fecha original, recalcula total, pagos, saldo y cuotas abiertas, y deja historial.
- Reserva con paquete distinto → bloquea la asignación con mensaje explícito (debe pasar por cambio de paquete).
- Habitación sin paquete → no infiere nada.

Caso Sergio Brukman (`cd6d21a8…`, Training Camp San Luis Octubre): quedó con paquete "Hab. doble con Pensión Completa", precio 944.900, pagado 100.000, saldo 844.900, con habitación asignada. Consistente.
(Su otra reserva `f115b458…` es del "Record de la hora", evento sin paquetes ni alojamiento: los nulls ahí son correctos.)

### 3) Causa upstream de creación sin paquete — SIGUE ABIERTA
El alta manual desde admin nunca setea `package_id`. En `src/components/admin/AdminEventReservations.tsx`:
- `addStudentToEvent` (insert ~línea 804) y `addExternalToEvent` (insert ~línea 857) insertan en `event_reservations` sin `package_id` ni `package_nombre_snapshot`, y usan `eventPrice` (precio del evento) como `amount_total`/`price_snapshot`, ignorando paquetes y sus price stages.
- No hay RPC de creación: es un insert directo desde el cliente.
- No existe restricción en base que impida `package_id NULL` en eventos con paquetes activos.

Por contraste, los otros caminos sí exigen paquete:
- Alumno (`ReservationDrawer.tsx`): el paso de paquete es obligatorio (botón deshabilitado sin `selectedPackageId`) cuando el evento tiene paquetes.
- Invitado (`create-guest-reservation`): `package_id` es requerido y el precio se resuelve del stage vigente en el servidor.

Consecuencia: una reserva creada por admin en un evento con paquetes nace con paquete nulo y precio del evento; sólo se autocorrige si después se le asigna una habitación con paquete. Si no hay alojamiento, o el evento tiene varios paquetes, queda mal (ése fue el origen tanto de Sergio como del patrón de Jorge).

## Estado actual de datos
Única bolsa de reservas activas sin paquete en eventos con paquetes: 3 en "Clínica Dinámicas de Carrera" (creadas por `cliente` en julio, evento sin alojamiento). No hay casos nuevos posteriores a la corrección.

## Corrección propuesta (pendiente de tu aprobación, no ejecutada)
1. En `AdminEventReservations.tsx`, agregar selector de paquete en el alta manual (alumno y externo): obligatorio si el evento tiene paquetes activos, oculto si no tiene.
2. Resolver precio en servidor, no en el cliente: nueva RPC `admin_create_event_reservation(event_id, alumno_id|external_participant_id, package_id, …)` que tome el precio del stage vigente vía `get_package_active_price` y setee `package_id`, `package_nombre_snapshot`, `price_snapshot`, `currency_snapshot`, totales y saldo.
3. Guard en base: trigger BEFORE INSERT en `event_reservations` que rechace `package_id NULL` cuando el evento tiene paquetes activos (con excepción explícita para eventos de sólo inscripción).
4. No tocar las 3 reservas históricas de la clínica ni ningún pago real; revisión manual aparte si hiciera falta.
