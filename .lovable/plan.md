# Caso Agustina Leguizamon — auditoría (solo lectura)

No se modificó nada: ni datos, ni código, ni configuración.

## Quién es

- Agustina Leguizamon, `b775372a-b4b5-4a92-90b5-bcc60ece0f39`, mail `agusleguizamon1@gmail.com`, usuario vinculado correcto, estado activo, grupo G2.
- No hay ficha duplicada. Las otras "Agustina/Agostina" del sistema son personas distintas (Mastronardi, Fanelli Evans).

## Lo más importante

**Hoy Agustina NO tiene ninguna cuota vigente y septiembre NO está pagado.** Las cinco cuotas que existen en su historial están todas anuladas:

| Período | Plan | Precio | Estado |
|---|---|---|---|
| 09/06–30/06 | Pista | 87.238 | anulada 01/09 "error en la carga" (sí tenía pago MP aprobado) |
| 01/07–31/07 | Grupal 1x semana | 58.400 | anulada 04/08, baja de agosto |
| 01/08–31/08 | Pase Libre | 83.500 | anulada 03/09 automáticamente: "Pago no confirmado por Mercado Pago (timeout 48h)" |
| 01/09–30/09 | Pase Libre | 83.500 | anulada hoy 04/09 a las 06:00, mismo motivo automático |
| 01/09–30/09 | Pase Libre (carga manual) | sin precio | anulada 01/09 "Plan removido por admin" |

La pantalla que vio el usuario (activa, Mercado Pago, 83.500) es de **antes de las 06:00 de hoy**: la cuota estaba creada como intento de pago, nunca se confirmó, y el proceso automático la anuló esta madrugada.

## ¿Hay un pago real de 83.500 de ella?

No. Revisado todo Mercado Pago:
- Ningún movimiento tiene su nombre, su mail ni referencia a "Leguizamon".
- Su cuota de septiembre nunca tuvo identificador de pago; quedó con código de error 400 (pago rechazado/no completado).
- Sí hay una transferencia de 83.500 del 03/09 sin dueño asignado (mail genérico de cobros), pero **no hay evidencia de que sea de ella**; no se puede afirmar sin comprobante.

Aclaración: sí pagó realmente en junio (87.238, pago Mercado Pago aprobado) — esa cuota fue anulada a mano el 01/09 como "error en la carga", y por eso desapareció de la cuenta corriente aunque el dinero entró. Esa cuota además figura como "cobrada sin factura emitida" en la vista de inconsistencias.

## Por qué la cuenta corriente sólo muestra 2 movimientos

La cuenta corriente se arma con `vw_cuenta_corriente_movimientos`, que **excluye por completo toda cuota anulada** (cargo y pago). Como las cinco cuotas de Agustina están anuladas, no queda ni un cargo ni un pago de escuela. Sobreviven solamente:
1. el ajuste de crédito de 7.208 del 13/07 ("saldo a cuenta error del pago del plan de junio"), y
2. la reserva del evento Record de la Hora del 10/05, sin importe cargado (`amount_total` vacío), por eso aparece en $0.

O sea: la cuenta corriente no está "omitiendo suscripciones activas" por un filtro raro. Está reflejando fielmente que hoy no hay ninguna cuota vigente. El agujero real es de datos, no de la vista.

## El saldo a favor de 7.208

- Ajuste `1a89bdfa-…`, crédito de 7.208 ARS, cargado el 13/07 por un admin.
- Nunca fue aplicado a ninguna deuda (`aplicado_a_fuente_tabla` vacío) y no hay imputaciones registradas para ella.
- No aparece en `vw_pagos_disponibles`, así que no hay riesgo de doble saldo por ahí; el crédito sólo vive en el ajuste.
- Sigue disponible: el saldo real a favor hoy es **7.208 ARS**, y no hay deuda registrada en contra porque el cargo de septiembre se anuló junto con la cuota.

## Alcance: ¿pasa en más casos?

- La anulación automática por "timeout 48h" afectó sólo 3 cuotas en total: 2 de Agustina y 1 antigua de una cuenta de prueba. No es masivo hoy, pero el mecanismo puede borrar del historial financiero cualquier cuota que un alumno intente pagar y no complete.
- Hay **38 alumnos activos sin ninguna cuota vigente** — mismo síntoma potencial (ficha activa, cuenta corriente vacía). Vale revisarlos en conjunto.
- Riesgo sistémico de fondo: al anular una cuota se borra también su rastro contable, incluso cuando hubo plata cobrada (caso junio de Agustina). El dinero cobrado queda sin cargo ni pago asociados.

## Comparación con alumnos normales

Los alumnos con Pase Libre de septiembre bien reflejados (por ejemplo Teresa Cancinos, Aldo Chaves, Laura Palermo) tienen todos un movimiento de Mercado Pago aprobado por 83.500 vinculado a su cuota, con descripción "Plan Pase Libre Mensual". Agustina no tiene ninguno: esa es la única diferencia de datos.

## Conclusión

- Septiembre: **no pagado**, y actualmente sin cuota vigente.
- Saldo real: **7.208 ARS a favor**, sin deuda registrada (pero con la cuota de septiembre pendiente de generarse si va a seguir).
- Causa raíz: intentó pagar por Mercado Pago, el pago nunca se acreditó, y el proceso automático anuló la cuota; como la cuenta corriente ignora cuotas anuladas, no queda rastro de cargo ni de pago.
- Causa secundaria: la cuota de junio, que sí se cobró, fue anulada a mano y con ello se perdió su registro contable.

## Corrección mínima sugerida (no ejecutada)

1. Confirmar con ella si pagó septiembre; si aparece el comprobante, identificar la transferencia de 83.500 del 03/09 y vincularla a una cuota de septiembre nueva.
2. Si no pagó: volver a generar la cuota de septiembre para que quede el cargo, y aplicar los 7.208 a favor.
3. Aparte, revisar los 38 alumnos activos sin cuota vigente y decidir si conviene que la cuenta corriente muestre las cuotas anuladas que tuvieron plata cobrada, en vez de ocultarlas.
