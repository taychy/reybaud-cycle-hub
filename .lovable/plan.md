## Objetivo

Que cada participante autogestione con quién comparte alojamiento desde el Hub del viaje, con invitación recíproca entre inscriptos y confirmación automática por mail. El admin en `EventLodgingManager` solo asigna habitaciones físicas a grupos ya formados.

## Flujo del alumno

1. En el Hub del viaje (donde ya vive `TripSummary`) aparece una tarjeta nueva **"Compañeros de habitación"** solo si el paquete requiere alojamiento y es compartido (doble/triple/cuádruple).
2. Muestra:
   - Paquete + tipo de habitación elegido (confirmación visual).
   - Slots vacíos según capacidad (ej: doble = 1 slot para invitar).
   - Autocomplete con otros participantes del mismo evento (busca en `event_reservations` + `alumnos` por nombre/email).
3. Al invitar → se crea fila en `reservation_roommates` con `confirmado=false` y se dispara mail al invitado.
4. El invitado ve en su propio Hub una tarjeta **"Invitación de compañero"** con Aceptar / Rechazar.
5. Al aceptar → se marca `confirmado=true` en ambos lados (vínculo recíproco) y se envía mail de confirmación a ambos con el resumen (paquete, tipo hab, compañeros).
6. Si el paquete es individual o sin alojamiento → tarjeta informativa sin acciones.

## Vista admin (EventLodgingManager)

- Agrupar automáticamente reservas con roommates confirmados mutuamente → mostrar como "grupo pre-armado" con badge 👥.
- Asignar un grupo entero a una habitación en 1 click (respeta capacidad).
- Si alguien no completó su grupo, aparece individual como hoy.

## Plantilla de comunicaciones

Crear plantilla transaccional **"Confirmación de alojamiento"** en el sistema de emails que ya usan los eventos (`send-transactional-email`), disparada por trigger cuando ambos confirman. Contenido:
- Paquete y tipo de habitación
- Compañero/s confirmados (nombre)
- CTA al Hub del viaje para modificar

## Cambios técnicos

**DB (migración):**
- Agregar columna `invited_by_alumno_id uuid` en `reservation_roommates` (para saber quién invitó a quién).
- Agregar columna `status text` con valores `pending|accepted|rejected` (mantener `confirmado` por compatibilidad, derivado de `status='accepted'`).
- RPC `accept_roommate_invitation(roommate_id uuid)` SECURITY DEFINER que valida que el `auth.email()` coincida con el email invitado y crea el vínculo recíproco (fila espejo en la reserva del invitado).
- RPC `list_event_participants_for_roommate(event_id uuid)` que devuelve inscriptos del evento (nombre, email, alumno_id) para el autocomplete, excluyendo al usuario actual y a quienes ya tienen grupo cerrado.

**Frontend:**
- Nuevo componente `TripRoommatesDrawer.tsx` (siguiendo el patrón de `TripBikeDrawer`, `TripPedalsDrawer`).
- Integrar tarjeta en `TripSummary.tsx` dentro del checklist del viaje (nuevo `step_key: "roommates"` en `TRIP_STEPS`).
- Detección de capacidad del paquete: parsear el label del paquete (doble=2, triple=3, cuádruple=4, individual=1, "sin alojamiento"=skip). Guardar como campo derivado.
- En `EventLodgingManager.tsx`: pre-agrupar reservas por grupos de roommates confirmados antes de renderizar.

**Emails (edge function):**
- Nueva plantilla React Email `roommate-invitation.tsx` (invitación pendiente).
- Nueva plantilla `lodging-confirmation.tsx` (ambos aceptaron).
- Registrar en `TEMPLATES` de `_shared/transactional-email-templates/registry.ts`.
- Disparar desde el frontend con `supabase.functions.invoke('send-transactional-email', ...)` al invitar y al aceptar.

## Orden de implementación

1. Migración DB (columnas + RPCs) — requiere aprobación.
2. Plantillas de email + registro.
3. `TripRoommatesDrawer` + integración en `TripSummary`.
4. Agrupación en `EventLodgingManager`.
5. Testing con reserva existente.

## Alcance excluido

- No se toca el flujo de compra del paquete (opción C del análisis previo queda para después).
- No se agrega marketing ni recordatorios masivos.
- Reservas de participantes externos (invitados sin cuenta) siguen manuales por admin.
