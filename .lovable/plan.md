# Auditoría solo lectura: ¿existe un segundo Rimini? (sin cambios)

No hay nada para construir. Este documento solo deja registrados los resultados de la auditoría. No se modificó código ni datos.

## Método
- Revisé todas las tablas base de `public` (vía information_schema), en todas las columnas text, varchar, json, jsonb, uuid y array.
- Términos buscados: Rimini, Emilia, Romagna, Oxygen Lifestyle y `4c37ae21-fa91-415c-aede-4b0b5240b424`.
- Descarté los falsos positivos por "Emilia" que en realidad eran el alumno "Emiliano Daniel Grosso": alumnos, aliases, audit_log, broadcasts, emails, facturas, facturacion_cola, suscripciones, tareas, marketing, MP y WhatsApp.

## Coincidencias reales
| Tabla | ID | Qué es | Estado / fechas |
|---|---|---|---|
| events | 4c37ae21… | "Emilia Romagna 2027", el único viaje | publicado; creado 24/08, publicado 29/09 19:32 |
| event_packages | 8aae6d4c… / 1f1a78b1… | Habitación doble e individual del mismo evento | activos |
| event_rooms | 15 filas | Habitaciones del mismo evento | creadas 24/08 |
| event_cost_simulations | 56394949… | Presupuesto "Rimini_2027" del mismo evento | v1 |
| event_package_payment_plans | 326ce19c… / de3ac48e… | "30% + 7 cuotas" v1 | archivados 29/09 19:09 |
| event_package_payment_plans | 0317629a… / fd6d3550… | "€500 + 8 cuotas" v2 | vigentes |
| event_favorites | f7116251… | Un alumno marcó el viaje como favorito | 30/09 12:20 |
| audit_log | 569fa9ce… | Cambio de borrador a publicado | 29/09 |
| event_survey_responses | 7c2de018… | Encuesta del viaje **TC Girona 2026**. Texto del alumno: "me enteré que en Rimini, el segundo fueron más de 30" | 13/07/2026 |

Reservas, lista de espera y participantes de 4c37ae21: 0 / 0 / 0. No hay ningún producto de tienda, preventa, pedido, pago ni campaña que mencione Rimini.

## Conclusión
- **En la base no hay evidencia de un segundo producto o viaje Rimini**, ni vigente ni archivado.
- Hay dos cosas concretas que pueden dar la impresión de un duplicado:
  1. **Planes de pago versionados**: cada paquete tiene dos planes con el nombre "Plan Rimini 2027", uno archivado (30% + 7) y otro vigente (€500 + 8). Vistos en la gestión del evento, parecen dos ofertas.
  2. **Dos paquetes** (doble e individual) dentro del mismo viaje.
- La única mención de un "segundo" Rimini es el comentario de un alumno en la encuesta de Girona. Habla de una edición o grupo externo de más de 30 personas, no de un registro de la app.

No hay cambios propuestos.
