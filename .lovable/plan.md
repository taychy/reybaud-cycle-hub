# Por qué la cuota de septiembre de Agustina figura en $0 — auditoría (solo lectura)

No se cambió nada: ni datos, ni código, ni configuración.

## El recorrido real del caso

1. **01/09 19:32** se crea la cuota de septiembre de Agustina (Pase Libre, 01/09–30/09, $83.500), como intento de pago por Mercado Pago: queda en estado "pendiente", sin número de operación y con código de error 400 en el intento (`suscripciones.5567e46d-…`).
2. **03/09 21:36** entra a la cuenta de Mercado Pago una **transferencia por CVU de $83.500** (operación 176157800685). En el registro figura: sin referencia externa, sin nombre de quien paga, mail genérico `cobrosreybaud@gmail.com`, descripción "Bank Transfer". **No hay ningún dato que la conecte con Agustina ni con su cuota.**
3. **04/09 06:00** el proceso automático `cleanup-pending-subscriptions` anula la cuota: busca cuotas "pendiente" + método mercadopago + sin número de operación + creadas hace más de 48 h, y las cancela con el motivo "Pago no confirmado por Mercado Pago (timeout 48h)". La cuota de agosto ya había caído igual el 03/09.
4. Como la cuenta corriente (`vw_cuenta_corriente_movimientos`) **excluye toda cuota anulada**, desaparecieron a la vez el cargo y cualquier rastro del pago. Por eso se ve Cargos $0 y sólo quedan el crédito de $7.208 (13/07) y una reserva de evento sin importe.

## Causa raíz

Es una **combinación de desacople y automatización destructiva**, no un filtro de UI caprichoso ni un error de cálculo:

- **Desacople suscripción ↔ cuenta corriente.** No existe una tabla de cargos propia: el cargo mensual *es* la fila de la suscripción, derivada en vivo por la vista. Si la suscripción se anula, el cargo desaparece retroactivamente. No hay asiento que sobreviva.
- **El automatismo de limpieza borra deuda legítima.** `cleanup-pending-subscriptions` fue pensado para eliminar intentos de pago abandonados, pero no distingue "intento zombi" de "cuota real impaga". A las 48 h elimina el cargo del mes en vez de dejarlo como deuda.
- **El pago no se pudo conciliar solo** porque las transferencias por CVU llegan sin referencia ni identidad del pagador; el webhook sólo vincula automáticamente cuando hay `external_reference` o número de operación en la suscripción.

Resultado: período creado, pago realmente recibido en la cuenta, y ni cargo ni pago reflejados. **Confianza: alta** para los puntos 1–4 y para el mecanismo de anulación; **media** para afirmar que esa transferencia del 03/09 es de Agustina (coincide monto y fecha, pero no hay dato identificatorio).

## Piezas concretas del flujo

| Pieza | Dónde | Qué hace |
|---|---|---|
| Anulación automática 48 h | `supabase/functions/cleanup-pending-subscriptions/index.ts` | cancela pendientes de Mercado Pago sin operación |
| Cuenta corriente | vista `vw_cuenta_corriente_movimientos` + `get_saldo_alumno` | ignora cuotas anuladas (cargo y pago) |
| Ingesta/conciliación MP | `mp_account_movements`, pantalla Admin > Mercado Pago (`MpMovementsTab.tsx`) | lista movimientos y permite asignarlos a mano |
| "Generar mensualidad y aplicar" | `assign_mp_movement_to_new_suscripcion` | crea la cuota del mes ya pagada con ese movimiento |
| Reparto entre alumnos | `crear_suscripcion_para_imputar` + `split_mp_movement_among_alumnos` | genera cuotas y divide un pago |
| Saldo a favor | `cuenta_ajustes` (crédito $7.208, nunca aplicado) y `cuenta_publica_consume_credit` | el crédito sólo se descuenta cuando alguien paga con el link público |

## Duplicados: el riesgo está contenido

- Índice único `uniq_sub_activa_alumno_plan_periodo` y validación previa en la función de "generar mensualidad" (`subscription_already_exists_for_period`) impiden dos cuotas vivas del mismo plan y mes.
- La función también rechaza reutilizar un movimiento ya vinculado a otra cuota u otro alumno.
- **Pero**: como las anuladas no cuentan para el índice, generar la mensualidad ahora crearía una cuota nueva de septiembre y quedaría la vieja anulada al lado, con el mismo importe. No es un cobro doble, sí es ruido histórico.
- El saldo a favor de $7.208 no se aplica solo: si se genera la cuota y se le imputa el pago completo, el crédito sigue intacto y podría contarse de nuevo más adelante.

## Rutas que permiten "período activo sin cargo"

1. Cuota pendiente por Mercado Pago que supera 48 h → anulada, cargo evaporado (el caso).
2. Anulación manual de una cuota que sí tuvo pago (le pasó en junio: pago aprobado de $87.238, cuota anulada el 01/09 como "error en la carga"; hoy figura como cobrada sin factura).
3. Transferencias/CVU sin referencia que quedan sin dueño (hay varias sin asignar en la cuenta).

## Situación de fondo

Hoy Agustina tiene cero cuotas vivas, saldo real **$7.208 a favor** y ninguna deuda registrada, pese a que septiembre está sin cobrar formalmente. Hay 38 alumnos activos sin ninguna cuota vigente, que conviene revisar con la misma lupa.

No propongo cambios en esta pasada, según lo pedido.
