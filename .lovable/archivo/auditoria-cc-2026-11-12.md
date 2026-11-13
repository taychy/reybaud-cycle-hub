# Auditoría: saldo a favor sobre deudas ya pagadas e imputadas (solo lectura)

No se modificó nada. Consultas SELECT acotadas sobre la base actual.

## Hallazgo confirmado (bug principal)
En la cuenta corriente, una cuota mensual puede recibir **dos haberes por el mismo dinero**:
1. el haber de la **imputación** del pago MP (rama `pago_imputacion`), y
2. el haber propio de la **suscripción marcada pagada manualmente** (rama "pago_suscripcion" desde `suscripciones`, con `metodo_pago` = transferencia / efectivo / mp_externo_*), que solo se suprime si existe un movimiento MP con `suscripcion_id` vinculado; **no se suprime cuando la cuota ya tiene una imputación activa**.

El saldo disponible del pago (`pago_saldo_disponible`) queda bien en 0; el error está en la vista de cuenta corriente, que por eso muestra saldo a favor igual al importe imputado.

Secuencia observada en los 13 casos: primero se imputó el pago (guardado bien porque la cuota estaba pendiente) y después, en la misma fecha o más tarde, la cuota quedó con método de pago manual (actualización manual o cierre/renovación). Ninguna función de imputación toca `suscripciones`; quién marcó el método queda como **hipótesis a confirmar con audit_log**.

### Alcance: 13 alumnos, 13 cuotas, hasta ARS 953.768 de haber duplicado (sin otras monedas)
| Alumno | Imputación | Cuota (método) | Precio | Imputado |
|---|---|---|---|---|
| Constanza Peñoñori | 51132f8b | d4f4ffda (mp_externo_claudio) | 71.240 | 68.476 |
| Daniel Mroz | bd45fa2c | 53eb77be (transferencia) | 83.500 | 76.472 |
| Florencia Bunge | 3e630b39 | 1b3272ca (mp_externo_josi) | 65.500 | 65.500 |
| Gustavo Rosa | 709e869a | 94636818 (transferencia) | 71.240 | 71.240 |
| María Lorena Tempone | cb7cdffb | e50da639 (mp_externo_claudio) | 83.500 | 83.500 |
| Martin Cortes | 5fe2ea02 | eb7412ae (mp_externo_claudio) | 71.240 | 71.240 |
| Mateo Melloni | d934dfc8 | 0b7719ed (mp_externo_claudio) | 71.240 | 64.600 |
| Mercedes Carlés | 5dfbac6c | 05cf0ba8 (mp_externo_josi) | 83.500 | 83.500 |
| Pablo Braier | 361b4e87 | ad872a57 (mp_externo_claudio) | 83.500 | 83.500 |
| Paula Edith Blasco | 4a7bdaff | c2b9900e (mp_externo_josi) | 65.500 | 65.500 |
| Pedro Ferroni | 287a6c62 | b7e82c19 (mp_externo_josi) | 83.500 | 83.500 |
| Sergio Celuch Eguren | 8506da7d | ddc87215 (efectivo) | 65.500 | 65.500 |
| Silvina Ambrosini | dfb82982 | e312644f (mp_externo_claudio) | 71.240 | 71.240 |

En cada caso, saldo correcto de esa cuota es 0 y el saldo a favor mostrado está inflado por hasta el importe imputado. El tope de ARS 953.768 vale solo si ninguno tiene además cobro real por el método manual; ese cobro real (efectivo/transferencia/MP externo) puede existir y debe confirmarlo la administradora con el comprobante (no se puede inferir de la base).

Mateo Melloni: su caso de 64.600 (cargo 27/08) corresponde a este patrón. Daniel Mroz: explica su remanente de 3.738 anterior y el desvío de 7.028.

## Hallazgo secundario (créditos libres con la misma referencia MP)
5 créditos manuales no aplicados (ARS 536.093,60) con la misma referencia que un MP ya vinculado o imputado: Constanza (68.476), Augusto Marcenaro (71.240), Mateo (241.637,60), Pedro Ferroni (83.500), Silvina (71.240).
- **Confirmado duplicado en cuenta corriente:** Augusto (MP vinculado a la cuota con haber completo + crédito libre).
- **Probable / a verificar:** los otros 4. La lógica actual descuenta el crédito del haber de la imputación, así que no se duplica por esa vía, pero se superpone con el hallazgo principal (mismo pago, tres representaciones).

## No duplicados / descartado
- Imputación a reserva + pago de reserva validado con el mismo MP: 0 casos.
- Natalia Basilico: sin imputaciones activas en este patrón; julio/agosto siguen sin tocarse.
- Saldo a favor y deuda simultáneos por hechos distintos: no se cuentan como bug.

## Bloqueos de acceso
- Con acceso de solo lectura no se pueden ejecutar `pago_monto_reconocido_cc` ni la vista completa de cuenta corriente (permiso de función): los importes se calcularon con las tablas y la definición SQL, no con el saldo final de la pantalla.
- No se revisó audit_log para saber quién marcó cada cuota como pagada.

## Responsables
- Vista `vw_cuenta_corriente_movimientos`, rama "Pago plan" desde `suscripciones`: solo excluye si hay `mp_account_movements.suscripcion_id`; ignora `pagos_imputaciones` y créditos aplicados.
- `obligacion_saldo_pendiente` sí bloquea imputar sobre una cuota ya marcada pagada, pero nada impide marcarla pagada **después** de imputar.
- Pantalla: `StudentCuentaCorrienteSection.tsx` y `SaldoDisponibleSection.tsx` solo muestran lo que da la vista (sin lógica propia duplicada).

## Arreglo mínimo propuesto (requiere autorización; sin reescribir historia)
1. **Vista (migración):** en la rama "Pago plan" desde `suscripciones`, emitir haber = `max(0, precio − imputaciones activas a esa cuota − créditos aplicados)` en lugar del precio completo. No cambia filas, ni pagos, ni facturación; corrige los 13 casos de una vez.
2. **Prevención:** guard en base que impida pasar una cuota con imputación activa a método manual distinto de su origen (o lo registre como "imputado"), con mensaje claro.
3. **Casos de cobro real adicional:** si la administradora confirma que también hubo efectivo/transferencia, ese dinero queda como saldo a favor legítimo; nada se borra.
4. Créditos libres de la sección secundaria: tratarlos uno por uno con los flujos auditados existentes, después del paso 1.

## Verificación posterior
- Consulta de reconciliación: por alumno, sumar haberes de la vista vs (pagos MP + créditos + cobros manuales reales) antes/después; los 13 deben bajar exactamente lo imputado.
- Pruebas aisladas: imputación + cuota luego marcada manual → un solo haber; cuota pagada manual sin imputación → haber completo; imputación parcial → haber del resto; casos de Rodrigo/Teresa/Mateo intactos.
