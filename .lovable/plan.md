# Auditoría solo lectura — Training Camp San Luis (reprogramado 5–9 nov 2026), corte 26/10/2026

Sin cambios de datos, código, configuración ni publicación. Solo consultas SELECT.

## 1. Identificar el evento y sus fuentes
- `events` (nombre, fechas, `metadata` de reprogramación, capacidad, cupos de transporte de bici).
- Paquetes en `event_packages` (5–9, 6–9, 5–8) y adicionales en `event_addons` (transporte de bici).

## 2. Universo de personas
- `event_reservations` (estado, paquete, alumno, montos) + `event_participants`.
- Habitación: `event_room_assignments` / `event_rooms`, y `metadata.shared_room_assignment`.
- Transporte de bici: `reservation_addons` del adicional de transporte (incluido en paquete vs contratado) y cualquier dato en el metadata de la reserva.

## 3. Decisiones de reprogramación
- `reservation_rescheduling_requests` (respuesta, estado admin aprobada/pendiente, decisión devolución/crédito).
- `reservation_rescheduling_history`, `rescheduling_settlement_proposals` (propuestas, sin ejecución).
- Cupos: `rescheduling_seat_releases`, `rescheduling_seat_occupancies`, `rescheduling_seat_history`.
- Devoluciones y crédito: `reservation_refund_obligations`, `devoluciones`, `cuenta_ajustes`.
- Reventas: `reservation_transfers` (verificar Ingrid Epp → Fernando Strada para no contar dos veces).

## 4. Clasificación nominal
- No asisten: nombre, decisión devolución/crédito, estado de liberación de cupo, tenía transporte de bici sí/no, estado de liberación del transporte.
- Continúan sin cambios.
- Cambios de paquete (origen → destino).
- Pendientes de respuesta.
- Validaciones puntuales: Julio Zabala (continúa) y Marcelo Suanni (liberación pendiente) — solo lectura, sin tocar sus datos.

## 5. Cálculos
- Cupos de participantes: libres efectivos (liberados y no reocupados) vs pendientes (bajas sin liberar).
- Cupos de transporte de bici: misma separación.
- Descontar reventas ya concretadas.

## 6. Entrega
- Reporte en chat con tablas, nombres de tablas/campos y cifras como evidencia.
- Advertencias explícitas cuando un dato no sea verificable (ej. transporte sin registro estructurado, decisiones sin respuesta guardada).
