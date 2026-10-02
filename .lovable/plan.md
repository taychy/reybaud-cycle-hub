# Comunicación de reserva para eventos públicos

## Implementación
- Definir una resolución reutilizable de audiencia desde `events.metadata.public_audience` con valores `open` y `students_only`.
- Mantener el comportamiento vigente como fallback: viajes/camps reservables serán abiertos; los demás eventos conservarán la comunicación restringida existente.
- Actualizar el bloque público para audiencia abierta con el título, subtítulo, CTA, acceso secundario y aclaración solicitados, sin cambiar el flujo técnico de reserva invitada.
- Mantener una comunicación diferenciada para eventos exclusivos de alumnos y evitar el mensaje de participación abierta.
- Exponer la audiencia en la edición administrativa del evento y configurar Emilia Romagna 2027 como `open` sin migración.

## Validación
- Verificar la landing de Emilia Romagna en escritorio y móvil, incluyendo apertura del flujo de reserva.
- Comprobar el fallback de un evento sin configuración y la presentación de un evento `students_only`.
- Ejecutar pruebas relevantes y confirmar que la compilación queda sin errores.
- Publicar la versión validada al finalizar.

## Alcance técnico
- Solo cambia texto visible y configuración de audiencia en metadata; no se modifican precios, pagos, cupos ni lógica de reserva.
