# Resumen del viaje — vista unificada por participante

Un único componente `TripSummary` que consolida toda la información de un participante en un viaje, reutilizable en 3 contextos (admin, alumno, externo), más dos reportes agregados a nivel evento (distribución de habitaciones y lista para seguro).

## 1. Datos que faltan capturar

Hoy no se recolectan de forma estructurada. Se agrega un nuevo `step_key` en `reservation_checklist_data` para cada bloque, con drawers propios:

- **Alimentación**: dieta (omnívoro / vegetariano / vegano / sin gluten / sin lactosa / otro) + restricciones libres + alergias
- **Habitación**: género para asignación, tipo preferido (single / doble / triple / compartir), compañero solicitado (texto libre o link a otro participante)
- **Arribos / partidas**: fecha-hora llegada, fecha-hora salida, medio (vuelo/auto/micro), número de vuelo, aeropuerto, requiere traslado sí/no
- **Salud + emergencia**: obra social, grupo sanguíneo, medicación, condiciones a informar, contacto emergencia (nombre, vínculo, teléfono) — reusa `alumno_familiares` cuando el participante es alumno
- **Peticiones especiales**: texto libre

Los datos ya existentes (bici, pedales, pasaje, seguro, extras) se muestran tal cual desde `reservation_checklist_data`.

## 2. Componente `TripSummary`

Nuevo archivo `src/components/reservation/TripSummary.tsx`. Recibe `reservationId` y `mode: "admin" | "student" | "external"` (+ `token` para external). Hace un único fetch consolidado (o un hook `useTripSummary`) que trae:

- reserva + evento + participante
- addons contratados (`reservation_addons`)
- ajustes (`reservation_financial_adjustments`)
- cuotas + pagos (`reservation_installments`, `reservation_payments`)
- checklist completo (`reservation_checklist_data`)
- roommates (`reservation_roommates`)
- notificaciones (`reservation_notifications`) — sólo admin/alumno
- historial de estados (`reservation_status_history`) — sólo admin

Layout en secciones colapsables (Collapsible ya está en el proyecto):

```text
┌─ RESUMEN DEL VIAJE ─────────────────────┐
│ Evento · Fecha · Sede · Participante    │
├─ COMPRA ────────────────────────────────┤
│ Paquete + precio, addons con cantidad,  │
│ ajustes, TOTAL / ABONADO / SALDO         │
├─ PAGOS ─────────────────────────────────┤
│ Plan de cuotas (estado) + pagos hechos  │
├─ CONFIGURACIÓN DEL VIAJE ───────────────┤
│ Bici · Pedales · Pasaje · Seguro        │
│ Habitación (género/tipo/compañeros)     │
│ Alimentación · Arribo/partida           │
│ Salud + emergencia · Peticiones         │
├─ COMUNICACIÓN ──────────────────────────┤
│ Notificaciones enviadas (colapsable)    │
│ Cambios de estado (solo admin)          │
├─ ACCIONES ──────────────────────────────┤
│ Imprimir PDF · Enviar por email ·        │
│ Copiar link externo (solo admin)         │
└─────────────────────────────────────────┘
```

Cada bloque de "Configuración" es clickeable si falta cargarlo → abre el drawer correspondiente (nuevo o existente).

## 3. Integración en las 3 vistas

- **Admin** — en `AdminEventReservations.tsx` (Sheet de la reserva): nueva sección arriba, colapsada por defecto, con toda la info + acciones admin (editar, PDF, reenviar mail).
- **Alumno** — en `ReservationStatusCard`: nuevo botón "Ver resumen completo" que abre un `Sheet` con `TripSummary mode="student"`.
- **Externo** — en `ExternalTripView.tsx`: reemplaza los bloques actuales (status + resumen pago + checklist) por `TripSummary mode="external"` para mantener paridad.

## 4. Reportes a nivel evento (admin)

Nueva pestaña "Reportes" dentro del panel de reservas del evento (`AdminEventReservations`):

- **Distribución de habitaciones**: agrupa participantes por `habitacion.tipo` y compañero solicitado, marca inconsistencias (ej. pidió doble y no tiene par). Exportable a CSV.
- **Lista para seguro**: tabla con Nombre completo · DNI · Fecha de nacimiento · Teléfono emergencia. Filtro por estado de reserva. Exportable a CSV/PDF.

## 5. Detalles técnicos

- **Migración DB**: agregar `step_key` válidos (`alimentacion`, `habitacion`, `arribo_partida`, `salud_emergencia`, `peticiones`) — no requiere columnas nuevas, `reservation_checklist_data.data` es JSONB.
- **Fetch consolidado**: nuevo hook `useTripSummary(reservationId, token?)` que en `external` usa `tripTokenApi` (server-side por token) y en admin/alumno usa supabase-js directo. Devuelve un shape estable así el componente no rama por modo.
- **PDF**: reutilizar la técnica de impresión ya usada en el evento QR (window.print con CSS `@media print`). Ruta oculta `/admin/eventos/:id/reservas/:rid/print`.
- **Nuevos drawers**: `TripMealDrawer`, `TripRoomDrawer`, `TripArrivalDrawer`, `TripHealthDrawer`, `TripSpecialRequestsDrawer` siguiendo el patrón de `TripBikeDrawer`. Guardan en `reservation_checklist_data` con `completed:true` y refrescan la vista.
- **Roommates**: se sigue usando `reservation_roommates`; el drawer de habitación permite proponer compañero por nombre/email y crea la fila con estado pendiente.
- **RLS**: los nuevos `step_key` heredan políticas existentes de `reservation_checklist_data` (ya soporta acceso por alumno, admin y token externo).

## 6. Orden de implementación

1. Migración de referencia + hook `useTripSummary`
2. Componente `TripSummary` con secciones de sólo lectura (usando datos existentes)
3. Drawers nuevos (alimentación, habitación, arribo, salud, peticiones)
4. Integración en las 3 vistas (admin, alumno, external) — reemplaza bloques duplicados en `ExternalTripView`
5. Reportes de evento (habitaciones + seguro) con export CSV
6. PDF imprimible + botón "Enviar resumen por email"

## 7. Preguntas antes de implementar

- ¿La lista para seguro necesita también nacionalidad / pasaporte, o alcanza con DNI + fecha de nacimiento?
- Para "compañero de habitación", ¿querés que el participante elija de una lista de otros inscriptos, o texto libre y luego admin cruza?
- El "Enviar resumen por email" ¿lo mandamos al participante, al admin, o ambos?
