# Validación final aislada del candidato 0111 — 13/11/2026

## Alcance y estado real
- Punto de partida: commit `69197e135de2ed00f295bfbc4de5547be86ac09a`; working tree inicialmente limpio y sin cambios concurrentes.
- Los respaldos del plan San Luis y de la auditoría se cotejaron nuevamente byte a byte; no se modificaron.
- Todo ensayo con escrituras ocurrió en PostgreSQL desechable local, con datos sintéticos y rollback. Lovable Cloud recibió únicamente consultas SELECT.
- No se aplicó DDL/DML en Lovable Cloud, no se modificaron pagos/créditos/suscripciones, no se desplegó, publicó ni enviaron comunicaciones.
- Comprobación posterior: `suscripcion_haber_manual_cc` sigue ausente, la vista productiva no contiene su llamada y la variante 0110 de `pago_monto_reconocido_cc` tampoco está aplicada. El ensayo principal de 12 casos usa 0083+0084, es decir, la forma vigente y no 0110.

## Precondiciones comprobadas
- La rama exacta que reemplaza 0111 sigue presente en `vw_cuenta_corriente_movimientos`; el `DO` aborta si cambia.
- Existen las dependencias `obligacion_imputado`, `pagos_imputaciones`, `cuenta_ajustes` y `mp_account_movements` con las columnas usadas.
- La función candidata es `STABLE SECURITY INVOKER`, sin permisos para `anon`; conserva acceso para `authenticated` y `service_role`.
- `get_saldo_alumno` agrega la vista y hereda la corrección. También se ejerció directamente en las regresiones aisladas.
- `pago_saldo_disponible` y las funciones de consumo no son reemplazadas. Los remanentes se comprobaron antes/después.
- La recreación conserva columnas y `security_invoker=true`; el rollback fue ejecutado y restauró el baseline completo de las 12 formas.

## Lectura productiva actual
La consulta global volvió a encontrar **12 cuotas activas, todas en ARS**, con el patrón de haber manual de precio completo más imputación activa. No apareció otra moneda ni otro alumno adicional en este patrón. La reducción proyectada sigue siendo **ARS 882.528**. Es una proyección: ningún saldo productivo fue alterado ni ejecutado con la vista candidata.

Daniel Mroz tiene una segunda operación independiente identificable: un MP vinculado a otra suscripción del mismo alumno, cuyo precio coincide con ese ingreso, y un complemento aplicado a la cuota afectada. El candidato conserva ambas operaciones y deja el conjunto en cero.

No se localizó una segunda referencia transaccional independiente en los otros 11 casos. Esto **no prueba que un cobro adicional no haya existido**. Todos quedan sujetos a revisión documental si administración espera un segundo ingreso; especialmente:
- Silvina Ambrosini: crédito aplicado sin referencia externa ni comprobante registrado.
- Pablo Braier: crédito aplicado sin referencia externa ni comprobante registrado.
- Sergio Celuch Eguren: crédito aplicado sin referencia externa ni comprobante registrado.

La consulta reutilizable quedó en `tests/sql/cc_0111_readonly_reconciliation.sql`; devuelve IDs técnicos, importes y banderas de evidencia, nunca URLs ni contenido de comprobantes.

## Conciliación aislada de las 12 formas reales
`tests/sql/cc_0111_twelve_cases_isolated.sql` reproduce importes, fuentes, imputaciones y tipos de crédito con UUID sintéticos, sin nombres, IDs productivos ni comprobantes. Las columnas de saldo corresponden a las obligaciones/representaciones aisladas de cada forma, **no al saldo completo actual de la ficha del alumno**.

| Alumno/caso | Moneda | Haber antes | Haber después | Saldo antes | Saldo después | Reducción |
|---|---|---:|---:|---:|---:|---:|
| Silvina Ambrosini | ARS | 142.480 | 71.240 | −71.240 | 0 | 71.240 |
| Paula Edith Blasco | ARS | 131.000 | 65.500 | −65.500 | 0 | 65.500 |
| Pablo Braier | ARS | 167.000 | 83.500 | −83.500 | 0 | 83.500 |
| Florencia Bunge | ARS | 131.000 | 65.500 | −65.500 | 0 | 65.500 |
| Mercedes Carlés | ARS | 167.000 | 83.500 | −83.500 | 0 | 83.500 |
| Sergio Celuch Eguren | ARS | 131.000 | 65.500 | −65.500 | 0 | 65.500 |
| Pedro Ferroni | ARS | 167.000 | 83.500 | −83.500 | 0 | 83.500 |
| Mateo Melloni | ARS | 312.877,60 | 248.277,60 | −241.637,60 | **−177.037,60** | 64.600 |
| Daniel Mroz (incluye segunda operación) | ARS | 247.210 | 170.738 | −76.472 | 0 | 76.472 |
| Constanza Peñoñori | ARS | 139.716 | 71.240 | −68.476 | 0 | 68.476 |
| Gustavo Rosa | ARS | 142.480 | 71.240 | −71.240 | 0 | 71.240 |
| María Lorena Tempone | ARS | 167.000 | 83.500 | −83.500 | 0 | 83.500 |

Resultado: **12 PASS / 0 FAIL**, reducción total exacta de **ARS 882.528**. El remanente genuino de la forma Mateo permanece como saldo a favor ARS 177.037,60 y el remanente no imputado de la forma Gustavo permanece distribuible (ARS 65.712). El rollback restauró los 12 haberes y saldos iniciales.

## Regresiones ejecutadas
- `bash tests/sql/run_cc_duplicate_credit_local.sh sql/pending/0111_cc_subscription_imputation_dedup.sql`: **17 PASS / 0 FAIL**.
  - Se agregaron dos operaciones independientes tipo Daniel, marca sin respaldo para revisión humana y suscripción EUR.
  - También cubre total/parcial, Mateo, créditos libres/aplicados, pagos no imputados, segundos cobros genuinos, vencidas, canceladas, reservas, tienda, devoluciones y RPC multi-deuda.
- `bunx vitest run src/lib/debtDistribution.test.ts src/lib/mpConciliacion.test.ts src/lib/mpConciliacion.cases.test.ts`: **20 PASS / 0 FAIL**.
- Regresiones 0083+0084 con candidato: bloques legacy PASS y carreras `credit_first`/`link_first` PASS.
- La misma batería con candidato+rollback: bloques legacy PASS y ambas carreras PASS.
- Consulta read-only reutilizable: sintaxis validada en esquema aislado.
- `git diff --check` y `bash -n` de los runners: OK.

## Bloqueos y límites que no se disimulan
- No existe un clon/restauración completa y segura de Lovable Cloud en este entorno. No se afirma haber probado la base completa.
- La lectura directa de la vista productiva agregada quedó bloqueada por `permission denied for function pago_monto_reconocido_cc`; `get_saldo_alumno` además exige rol administrativo. Por eso no se presentan saldos completos productivos antes/después como si hubieran sido ejecutados.
- Los saldos de la tabla anterior son resultados reales del ensayo aislado por forma financiera. Los haberes/deltas productivos son SELECT de proyección sobre las tablas actuales.
- Una marca manual puede ser el único rastro de un segundo cobro legítimo. El candidato no borra esa marca ni datos históricos, pero sí deja de reconocer su precio completo como haber adicional. Los casos sin referencia independiente requieren criterio documental humano; no se debe crear ni destruir un ingreso automáticamente.

## Condiciones para una activación posterior, con autorización separada
1. Revalidar en la misma ventana los 12 IDs, monedas, imputaciones, addbacks y la definición exacta de la vista; abortar si cambia cualquier caso o la rama esperada.
2. Revisar documentalmente los 11 casos sin segunda referencia independiente, con prioridad en Ambrosini, Braier y Celuch Eguren. Si existe otro cobro real, documentarlo como fuente separada; no inferirlo por monto o fecha.
3. Guardar la definición previa de la vista y el resultado de la consulta read-only como evidencia de aplicación. Aplicar 0111 únicamente mediante la herramienta de migración autorizada; este informe no la autoriza.
4. Con una sesión/rol que pueda ejecutar la vista y `get_saldo_alumno`, conciliar inmediatamente cada alumno/moneda: delta esperado según tabla, deudas verdaderas intactas, remanentes disponibles sin cambio y ausencia de efectos en EUR/USD.
5. Mantener `sql/pending/0111_cc_subscription_imputation_dedup_rollback.sql` listo. El rollback restaura la vista anterior sin tocar datos; no requiere borrar la función auxiliar.
6. No publicar frontend como parte de esta corrección: el cambio es exclusivamente de vista/función SQL.
