# Training Camp San Luis: cupo de Ingrid y error "v_event has no field nature"

## Diagnóstico (verificado, solo lectura)

**Causa técnica (punto 4):** la función del servidor `admin_create_event_reservation` (la que usa Admin → Agregar participante) tiene esta línea:

`v_inscription_only := COALESCE(v_event.nature, '') = 'propio_solo_inscripcion';`

La tabla `events` **no tiene una columna `nature`**. El tipo de evento se guarda en `events.metadata->>'event_nature'` (así lo escribe el formulario de eventos y lo lee el resto de la app). Por eso falla siempre, para cualquier evento y cualquier paquete; no tiene nada que ver con la Etapa 3 ni con la habitación individual.

El mismo error está escondido en la protección `guard_reservation_package_required` (`SELECT nature FROM events`). Hoy no salta porque solo se ejecuta cuando la reserva no tiene paquete, pero fallaría igual.

## Flujo de negocio recomendado (puntos 1 a 3)

- **Cancelar a Ingrid y crear una reserva nueva** para el alumno, no "cambiar el participante" sobre la reserva de Ingrid.
  - No existe hoy una función de transferencia de reserva entre personas; habría que construirla.
  - La reserva de Ingrid tiene sus propios pagos, condiciones aceptadas, historial y avisos. Pasarlos a otra persona mezclaría la trazabilidad y lo que ella pagó.
- **Capacidad:** al cancelar a Ingrid con "liberar plaza", el cupo de la habitación individual vuelve a estar disponible. La reserva nueva lo ocupa. No se duplica nada mientras la de Ingrid quede cancelada antes de crear la nueva.
- **Paquete y precio:** el alumno nuevo entra a "Hab. individual con Pensión Completa" al precio vigente hoy (Etapa 3, $1.196.690 ARS). Esto lo resuelve el servidor, no el navegador. No hereda el precio que tenía Ingrid.
- **Pagos y seña:** lo que pagó Ingrid queda en su reserva cancelada. Si hay que devolverlo o dejarlo como saldo a favor, se resuelve aparte, como siempre (nunca automático). El alumno nuevo arranca con su propia seña y plan de pagos.
- **Alojamiento:** la habitación individual no tiene compañeros, así que no hay que reorganizar a nadie.
- **Trazabilidad:** queda la cancelación de Ingrid en su historial y la reserva nueva con quién la creó. Opcionalmente, una nota en ambas: "Cupo liberado por Ingrid → reasignado a X".

## Cambio mínimo propuesto (punto 5)

Una sola migración que corrige las dos funciones, sin tocar datos:

1. En `admin_create_event_reservation`, leer el tipo de evento desde `metadata->>'event_nature'` en vez de `v_event.nature`.
2. En `guard_reservation_package_required`, lo mismo.

Nada más cambia: ni precios, ni paquetes, ni la reserva de Ingrid.

## Verificación posterior

- Confirmar que las dos funciones ya no mencionan `nature` como columna.
- Correr las pruebas de `eventPackageAdd` (lógica espejo).
- No crear ninguna reserva de prueba en el evento real. Natalia hace el alta.
- Antes de que lo haga, confirmar que la reserva de Ingrid figure como cancelada y que la plaza esté libre.
