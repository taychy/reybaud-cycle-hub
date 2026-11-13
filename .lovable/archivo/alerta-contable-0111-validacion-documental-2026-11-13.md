# Alerta contable 0111 — validación documental (2026-11-13)

Estado: **0111 BLOQUEADA / NO APLICAR**. Documento solo informativo; sin cambios en producción, datos, vistas ni funciones. Base: commit `8eec35a7d43f1f0dd8d5d5f8803f21e8857c33dd`, `vw_cuenta_corriente_movimientos` (2757 movimientos) y `get_saldo_alumno(uuid)` (fallback RPC = 0 en los 12 casos).

Los saldos son **contables según la app**, no deuda real validada ni exigible. Signo: positivo = deuda, negativo = crédito. La columna "después" es una proyección hipotética del candidato 0111 y **no equivale a un saldo correcto**.

| Alumno | Actual (ARS) | Después 0111 (hipotético) |
|---|---:|---:|
| Pedro Ferroni | -4.175 | 79.325 |
| María Lorena Tempone | -83.500 | 0 |
| Mercedes Carlés | -83.500 | 0 |
| Pablo Braier | -87.675 | -4.175 |
| Daniel Mroz | 203.528 | 280.000 |
| Silvina Ambrosini | -75.116 | -3.876 |
| Gustavo Rosa | -142.480 | -71.240 |
| Constanza Peñoñori | 143.278 | 211.754 |
| Paula Edith Blasco | -65.500 | 0 |
| Florencia Bunge | -223 | 65.277 |
| Sergio Martín Celuch Eguren | 9.302 | 74.802 |
| Mateo Melloni | 189.840,40 | 254.440,40 |

La reducción total de ARS 882.528 es matemática. **No significa que esos ARS 882.528 sean crédito ficticio confirmado.**

## Hechos (registros)
- **Pablo Braier:** pagos MP aprobados de $83.500 el 02/08 (op 171654805120) y el 02/09 (op 176799984006). El de agosto está imputado a la suscripción de septiembre (361b4e87). En septiembre hay además un crédito manual de $83.500 ("Débito automático", sin referencia) y un cargo manual "Mensualidad Sept" de $83.500 sobre la suscripción de septiembre. El MP de $87.675 del 01/10 (op 180728373131) está aplicado a ese cargo manual.
- **Silvina Ambrosini:** pagos MP de $71.240 el 01/08 (op 170631274297) y el 01/09 (op 176655166446). El de agosto está imputado a septiembre (dfb82982) y también figura un crédito libre de $71.240 con la misma referencia. Hay un crédito de septiembre "Débito automático" de $71.115 sin referencia, un pago manual de agosto con excedente de $6.640 y un ajuste de cargo de $2.764.
- **Pedro Ferroni:** pagos MP distintos de $83.500 el 01/08 y el 01/09, con el de agosto imputado a septiembre. Hay un cargo manual "Mensualidad agosto" de $83.500, un "ajuste saldos" de $167.000 y créditos MP aplicados.
- **Sergio Celuch Eguren:** MP de $65.500 el 03/09 imputado a agosto. Agosto figura también en efectivo, más otro crédito manual de $65.500 sin referencia ni comprobante, cargado 2 minutos después.
- **Mercedes Carlés:** MP de $87.675 del 30/09 vinculado a octubre.

## Hipótesis (no confirmadas)
- **Braier:** posible doble cargo de septiembre (cargo manual más suscripción) y pagos mal aplicados, como dice el correo de Natalia "Cuenta corriente app Reybaud".
- **Ambrosini y Ferroni:** son pagos reales de dos meses distintos, así que no hay que asumir que sean falsos. Requieren conciliación cronológica.
- **Celuch Eguren:** no se sabe si hubo un segundo efectivo. Sin evidencia, no se decide.
- **Augusto Marcenaro:** posible cargo mensual duplicado de septiembre de $71.240.
- Hay un cargo de Pedro cuya descripción dice "agosto" pero tiene fecha de septiembre. No se clasifica automáticamente.
- **Mercedes:** no asumir un doble pago de septiembre.

## Evidencia administrativa (no es prueba de referencia exacta)
Según reportes de Natalia: Silvina tiene julio y agosto PAGADOS, Florencia Bunge septiembre PAGADO el 31/08 y Pedro Ferroni septiembre PAGADO.

## Riesgos
- Aplicar 0111 podría borrar haberes legítimos de una segunda cobranza real y generar deuda falsa.
- Los cargos manuales duplicados harían que la deuda posterior quede inflada.
- Hay un borrador de Gmail sin enviar: no se envía nada.

## Condición de desbloqueo
Conciliar operación por operación (MP, cuenta y mes) y los cargos y créditos manuales con Natalia: Braier, Ambrosini, Ferroni, Celuch Eguren y Marcenaro. Después, revalidar el candidato. Cualquier corrección requiere una autorización separada.
