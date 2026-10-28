# Auditoría solo lectura — Landing TC San Luis (5–9 nov 2026)

Evidencia: consultas SELECT en la base al 28/10 17:34 UTC. No se tocó ningún dato, código ni publicación. Todavía no se recorrió el navegador en esta auditoría.

## Resultados ya comprobados en la base

| Punto | Estado | Evidencia |
|---|---|---|
| Publicación | Aprobado (datos) | Evento activo, `show_public=true`, `publicado`. Falta comprobar la URL en el navegador. |
| Fechas guardadas | Riesgo | En la base siguen siendo 22–25/10. La fecha 5–9/11 sale solo de la capa de reprogramación; cualquier pantalla o mail que lea la fecha guardada mostrará octubre. |
| Paquete doble | Aprobado (datos) | Activo, ARS 1.039.390, seña ARS 197.000, cupo 10. |
| Paquete individual | Falla / decisión | Ahora figura **ACTIVO** (ARS 1.196.690, seña 197.000). El mailing dijo que no estaba a la venta. Hay que confirmar si se activó a propósito. |
| Cabaña triple | Riesgo | Activa, ARS 684.860, **sin seña configurada**. Falta verificar qué cobra o muestra el formulario. |
| Seña general | Inconsistente | `deposit_amount` del evento = 100.000 y los paquetes = 197.000 o vacío. |
| Habitaciones | Aprobado (datos) | 21 habitaciones. Lugares libres: mixta 2, varones 2+2+2, mujeres 1 en triple, 2 individuales con capacidad libre (una de mujeres). |
| Bajas | Aprobado | 10 plazas liberadas con trazabilidad, sin habitación asignada. |
| Scarlett Barros | **Falla bloqueante** | La reserva `ef7ec532` está `reserva_confirmada` en individual, con pago 0, sin habitación y sin liberación. El cálculo cuenta las reservas activas sin habitación, así que **ocupa 1 de las 2 individuales libres**. |
| Reservas nuevas desde el 26/10 | Información | Ninguna. No hay compras posteriores al mailing. |
| Sincronización de cupos | Riesgo | `events.spots_taken=16` y `metadata.available_spots=0` son valores viejos que no coinciden con el inventario real. Hay que confirmar que la landing no los use. |
| Plan de pagos | Riesgo | 3 reservas confirmadas no tienen plan de pagos asignado. |
| Apertura controlada | Información | No hay apertura controlada. La venta usa el flujo normal por habitación. |

## Pendientes de verificar (no comprobados todavía)

1. Navegador como invitado, en computadora y celular, en reybaud-app.com: fecha que se ve, paquetes, precios, cupos, variantes 5–8 y 6–9 solo como consulta, botón de reserva.
2. Formulario con cuenta y sin cuenta: validaciones, género para triple, apto físico, aceptación de condiciones. Se llega hasta antes de confirmar, sin enviar.
3. Pago y vencimiento: qué seña aparece en cada paquete (triple sin seña), cuándo vence una reserva sin pago y si se libera.
4. Mails de confirmación: plantilla, fecha que muestra (riesgo de octubre) y que se encolen sin duplicados. Se revisa el código, sin enviar.
5. Concurrencia y sobreventa: revisar en el código el control de cupo del servidor (`create-guest-reservation`, `get_package_available_spots`, guardas de habitación). Se prueba la carrera por el último lugar solo en una base aislada.
6. Errores: paquete agotado, doble envío del formulario, enlace inválido.

## Acciones sugeridas (requieren autorización aparte)

- Decidir qué hacer con la reserva de Scarlett Barros: cancelarla o liberarla como prueba, de forma auditada, para que deje de bloquear la individual.
- Confirmar si la individual debe estar a la venta. Si no, desactivarla.
- Definir la seña de la triple y unificar la seña general.
- Corregir los contadores viejos (`spots_taken` y `available_spots`), o confirmar que nada los muestra.

Si se aprueba, ejecuto los pendientes 1 a 6 sin escribir datos y entrego un informe final con aprobado / falla / no verificado por cada punto.
