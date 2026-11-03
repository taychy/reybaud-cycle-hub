# Auditoría San Luis: compras de cupo de Fernando Strada y Tomás Muller

Solo lectura. No se cambió nada. Al aprobar, se harían **únicamente** las dos correcciones de abajo.

## 1. Fernando Strada (compró la reserva de Ingrid Epp)

**Datos confirmados en la base**
- Reserva de Fernando `30c0259f` (confirmada, 06/10). Paquete: Hab. individual con PC $1.196.690.
- Extras: noche extra individual «antes» $80.000 (30/10) y masaje 60 min $40.000 (02/11). **Total $1.316.690.**
- Reserva de Ingrid `d7b9ca7f`, cancelada. Pagó a la escuela $840.925: $350.000 (17/07), $246.975 (30/07), $243.950 (31/08). Hay un intento de $246.975 rechazado que no cuenta.
- Transferencia de cupo `e939fd47`, modalidad «pago directo a la titular»: a Ingrid $840.925, a la escuela $355.765.
- Pagos de Fernando a la escuela: $355.765 (MP 181483222127, 13/10) y $120.000 (MP 186388331903, 03/11, cubre los dos Extras). Total $475.765.
- Pago directo Fernando → Ingrid registrado: **$840.000** (14/10, confirmado). Antes se cargaron tres pagos mal escritos ($840,925, $840,08 y $839.243,99) y luego se anularon. Se reemplazaron por un solo pago de $840.000, «verificado».

**Cuenta**
- $1.316.690 − $475.765 − $840.000 = **$925 de saldo**. El sistema muestra $925, no $975.
- Causa: el pago directo quedó en $840.000 y el acuerdo dice $840.925. Faltan exactamente $925.
- Para Reybaud no se duplica ingreso: los $840.925 de Ingrid se transfirieron a Fernando. La escuela cobró de verdad solo los $475.765 de Fernando.

**No confirmado:** si el comprobante 1120 dice $840.000 o $840.925. La nota de rectificación del 14/10 dice «pago real verificado ARS 840.000».

**Corrección propuesta (solo si el comprobante dice $840.925)**
- Anular el pago directo `bafa6be2` ($840.000) con motivo y cargar uno nuevo de $840.925 con el mismo comprobante, por el flujo de pagos entre participantes. Resultado: saldo $0.
- No tocar los pagos a la escuela, los Extras ni la reserva de Ingrid.
- Si el comprobante dice $840.000, el saldo de $925 es real y la corrección no corresponde: Fernando le debe $925 a Ingrid, o se decide condonarlo.

## 2. Tomás Muller (compró la reserva de Jorge Monczor)

**Datos confirmados en la base**
- Reserva de Jorge `686f7545`, cancelada. Paquete Hab. doble con PC, total $859.000, pagado $859.000.
- Transferencia de cupo `d715c077`: está en «publicada». **No tiene reserva compradora vinculada**, no hay acuerdo ni pago directo cargado.
- Tomás tiene una reserva propia `162efadd` (confirmada, 12/10). Se creó como reserva nueva a nombre de tmullerk@hotmail.com, **sin vínculo a su ficha de alumno**. Paquete Hab. individual con PC: **$1.196.690**. Sin Extras ni cuotas.
- Pagos a la escuela: $100.000 (MP 182731268357, 12/10) y $237.690 (MP 183995496666, 13/10) = **$337.690**. Ambos ingresos de MP sí están vinculados a su ficha. Sin duplicados.
- Saldo en el sistema: **$859.000** = exactamente lo que le pagó a Jorge.

**Causa:** la compra no se procesó como transferencia de cupo. Los $859.000 que recibió Jorge no figuran en ningún lado.

**No confirmado:**
- No hay comprobante de los $859.000 cargado en la base.
- Cambio de paquete: Jorge tenía doble ($859.000) y Tomás tiene individual ($1.196.690). Las cuentas cierran: $859.000 + $337.690 = $1.196.690. Falta confirmar que la diferencia de modalidad fue acordada.
- Rooming y fechas de Tomás no se revisaron.

**Corrección propuesta**
1. Vincular la transferencia `d715c077` a la reserva `162efadd` con modalidad «pago directo»: a Jorge $859.000, a la escuela $337.690.
2. Cargar el pago directo Tomás → Jorge por $859.000 con comprobante. Resultado: saldo $0, sin ingreso de caja nuevo.
3. Vincular la reserva `162efadd` a la ficha de Tomás (`0ba067cd`) para que aparezca en su cuenta corriente.
4. Limitación: el flujo actual de transferencias se basa en reservas creadas desde la reventa. Antes de vincular una reserva ya existente, hay que verificar que la función lo permita. Si no lo permite, se haría con un paso administrativo auditado, sin borrar ni recrear la reserva.

## Fuera de alcance, para revisar aparte
- Tomás tiene **dos créditos de $90.400** por la orden de tienda #117 (28/10 y 03/11). Puede ser otra doble representación del mismo cobro.
- Sin jornada adicional ni gastronomía cargadas en ninguna de las dos reservas.

## Anexo: enlace privado para pagar la jornada adicional (informe anterior)
- Se puede reutilizar el enlace privado por reserva de la jornada adicional y el cobro de Mercado Pago de reservas.
- Falta un cobro «solo este Extra», con monto calculado en el servidor (hoy el navegador puede enviar un monto) y ligado a la línea del Extra.
- También falta un bloqueo contra doble cobro: un solo intento abierto por línea, no cobrar si ya está pagado o si hay un ingreso pendiente de imputar, y bloquear casos con pagos mal imputados.
- Se puede preparar con el cobro apagado: listado borrador de destinatarios y correo en borrador. Los Extras siguen inactivos hasta que se aprueben los valores.
