# Auditoría (solo lectura): Fernando Strada / Ingrid Epp — Training Camp San Luis

No se modificó nada. Evento `67b4e85d-…`, paquete `0089ec6a-…` (Hab. individual con PC).

## Evidencia

**Reserva de Ingrid** `d7b9ca7f-b707-4c2f-97a4-4d332cc98fee` — estado `cancelada` (cupo transferido), total guardado $1.249.000.
| Pago | Fecha | Importe | Estado |
|---|---|---|---|
| `0f47d3e6` transferencia | 16/07 | $350.000 | validado |
| `396e25d8` MP | 30/07 | $246.975 | rechazado (no suma) |
| `b6a2b0b0` MP | 30/07 | $246.975 | validado |
| `d3dd4a82` MP | 31/08 | $243.950 | validado |
Total pagado real a Reybaud: **$840.925**. Ingrid no tiene crédito ni saldo a rendir: lo pagado se lo devuelve Fernando directamente (Reybaud caja $0).

**Reserva de Fernando** `30c0259f-ebb5-45b8-a767-075aa95d7d16` — `reserva_confirmada`, total $1.196.690.
- Pago MP `ed1b113b` (mp 181483222127), 05/10, **$355.765 validado**.
- Columna guardada `balance_due` = **$840.925** (no incluye pagos directos entre participantes).

**Transferencia** `e939fd47-…` — estado `payment_agreement_defined` (no completada). Acuerdo: directo a Ingrid $840.925 + Reybaud $355.765.

**Pagos directos Fernando → Ingrid registrados (los $840.000 sí existen, mal cargados):**
| ID | Cargado | Importe | Fecha de pago escrita | Nota |
|---|---|---|---|---|
| `e695f78c` | 12/10 | **$840,925** (punto decimal) | `0026-10-05` | comprobante PDF, control 1120 |
| `3a9a563e` | 13/10 | **$840,08408** | 2026-10-08 | "error al escribir el monto… compensar" |
| `bdfa6a1b` | 13/10 | **$839.243,99** | `0206-10-08` | sin comprobante |
Suma = $840.924,999 ≈ $840.925. Los tres están `confirmed`.

## Diferencias exactas
- Fernando: 1.196.690 − 355.765 − 840.924,999 = **≈ $0,001** de saldo efectivo.
- Fernando dice haber pagado $840.000; el acuerdo y lo cargado son $840.925 → diferencia de **$925** a confirmar con el comprobante.
- Saldo visible $840.925 vs saldo efectivo ≈ $0.

## Causa
**Confirmada:**
1. El monto del pago directo se escribió con punto como miles ($840,925 en vez de $840.925); se "compensó" con dos registros más en vez de anular el primero. El total cuadra, pero hay 3 filas, montos con centésimas raras y 2 fechas imposibles (años 0026 y 0206).
2. `event_reservations.balance_due` de Fernando nunca descuenta pagos directos; solo la función `reservation_effective_payment_summary` los suma. En `ReservationStatusCard.tsx` el saldo efectivo solo se aplica a una parte (línea ~281); los bloques de Saldo (≈625, 849, 874, 918–958) y la cuota única (`3535132d`, pagado $355.765, `parcial`) siguen leyendo los valores guardados → muestra $840.925.
3. La transferencia sigue sin cerrar; el residuo de $0,001 (redondeo de 840,08408) podría impedir "Listo para cerrar".

**Hipótesis (sin confirmar):** qué pantalla exacta ve el usuario como "resumen"; si el pago real fue $840.000 o $840.925.

## Impacto
- Fernando ve deuda inexistente y podría recibir recordatorios de cobro.
- Riesgo de que KPIs/deudores cuenten $840.925 como pendiente.
- Datos de auditoría sucios (fechas 0026/0206). Sin impacto en caja Reybaud ni en Ingrid.

## Propuesta (no ejecutada, requiere autorización)
1. Datos: anular (`voided_at` + motivo) `e695f78c`, `3a9a563e` y `bdfa6a1b` y registrar uno solo por el monto real del comprobante (control 1120), fecha 05/10/2026. Si fue $840.000, decidir si los $925 quedan como saldo de Fernando o se condonan.
2. Cerrar la transferencia (`completed`) y que el saldo de Fernando y su cuota reflejen el pago directo.
3. Código: validar en `TransferAgreementPanel` monto entero en ARS (rechazar decimales de 3+ dígitos) y fecha con año razonable; usar el saldo efectivo en todos los bloques de Saldo de `ReservationStatusCard` y en deudores/recordatorios; redondear a centavos en el resumen.
4. Pruebas: unit tests para la validación y para el saldo efectivo con pagos directos.

## Decisión necesaria
¿El pago real a Ingrid fue $840.000 o $840.925?
