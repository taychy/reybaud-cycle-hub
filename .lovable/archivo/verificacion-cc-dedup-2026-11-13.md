# Verificación: deduplicación de haberes en cuenta corriente (13/11/2026)

## Alcance y preservación
- Implementación y pruebas solamente en repositorio y PostgreSQL desechable local.
- No se aplicó la migración candidata a Lovable Cloud; comprobación SELECT posterior: función candidata ausente y vista productiva sin modificar.
- No se insertaron, actualizaron, anularon ni eliminaron registros financieros reales.
- No se publicó ni desplegó la app.
- Plan San Luis recuperado íntegramente desde `9695500238dd8a71ff5199613f4b330d53262167^`: 5.055 bytes, SHA-256 `799f913be0f1839932c6f1f76e2a302a2b374e82a143469f5e67f9fe42cef4a1`.
- Auditoría vigente copiada íntegramente: 5.985 bytes, SHA-256 `eb919d0f8cad0f282f4015406630c950be3a6d18a7824460f23dc2d678c26f34`.
- Ambos `cmp` terminaron sin diferencias; `.lovable/plan.md` no fue reemplazado.

## Definiciones comprobadas
- `vw_cuenta_corriente_movimientos`: la rama manual `pago_suscripcion` emitía el precio completo aun con imputaciones activas; solo excluía MP vinculado directamente.
- `get_saldo_alumno`: agrega esa vista; hereda el doble haber y no necesita una segunda fórmula paralela.
- `pago_monto_reconocido_cc` y la rama `pago_imputacion` ya limitan el reconocimiento del origen y el remanente.

## Corrección candidata
Archivo: `sql/pending/0111_cc_subscription_imputation_dedup.sql`.
- Nuevo cálculo del haber manual residual: precio menos imputaciones activas.
- Si un crédito aplicado representa la misma operación MP y ya suprime el haber de imputación, se restaura solamente ese solapamiento para no borrar el ingreso histórico.
- La causalidad exige `mp_payment_id + cuenta_mp_id + moneda`; no se deduplican importes por coincidencia de monto o fecha.
- Un segundo cobro genuino registrado como crédito/MP separado se conserva.
- `get_saldo_alumno` recibe el resultado corregido desde la vista.
- No se agregó un guard nuevo al marcar cuotas: no es seguro bloquear complementos manuales legítimos ni rutinas existentes. Los guards de crédito/vinculación ya existentes quedan intactos.

Rollback: `sql/pending/0111_cc_subscription_imputation_dedup_rollback.sql` restaura la rama anterior y deja la función deprecada, sin `DROP` ni cambios de datos.

## Pruebas reales
### Antes, con fixture corregido y sin candidato
`tests/sql/run_cc_duplicate_credit_local.sh`
- 9 PASS / 5 FAIL de 14.
- Fallos reproducidos: total ARS 125.000 → haber 250.000 y saldo −125.000; parcial 60.000 + complemento → 185.000; Mateo → 232.302; crédito libre duplicado → 250.000; segundo cobro separado → 275.000.

### Después, candidato aplicado solo en PostgreSQL desechable
`tests/sql/run_cc_duplicate_credit_local.sh sql/pending/0111_cc_subscription_imputation_dedup.sql`
- **14 PASS / 0 FAIL**.
- Cubre total, parcial/complemento, dos deudas/remanente Mateo, crédito libre y aplicado con mismo MP, pago no imputado, segundo cobro genuino, mensualidad manual vencida, crédito normal, reserva EUR, rechazos/anulaciones, tienda/devolución USD, canceladas, crédito verdadero y RPC multi-deuda idempotente.

### Unitarias
`bunx vitest run src/lib/debtDistribution.test.ts src/lib/mpConciliacion.test.ts src/lib/mpConciliacion.cases.test.ts`
- **20 PASS / 0 FAIL**, 3 archivos.

### Compatibilidad anterior y concurrencia
Con 0083+0084+candidato, sin introducir 0110 en esa ejecución:
- `reconciliation_legacy_rollback.sql`: PASS.
- `reconciliation_legacy_gaps_rollback.sql`: 3 bloques PASS.
- Carreras `credit_first` y `link_first`: 2 PASS.
- Rollback candidato: mismos 4 bloques SQL y 2 carreras PASS.

La ejecución histórica `gaps` combinada con 0110 falla tanto sin como con el nuevo candidato: espera haber 1.000 antes de distribuir, mientras 0110 reconoce 800 y deja 200 disponibles. Es una expectativa anterior incompatible con 0110, no una regresión de este candidato; la nueva prueba 3 cubre el comportamiento 0110.

### Verificación estática
- Candidato y rollback aplicados sintácticamente en PostgreSQL local.
- `git diff --check`: OK.
- `bash -n tests/sql/run_cc_duplicate_credit_local.sh`: OK.
- El candidato solo contiene función, grants/comentario y recreación de vista; ningún `INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER` de datos.

## Revalidación de los 13 casos de la auditoría
La consulta SELECT actual encontró 12 cuotas que todavía cumplen el patrón. Martin Cortes ya no tiene `is_subscription_paid=true` (`origen_registro=renovacion_pendiente`, `chequeado_admin=false`), por lo que actualmente no emite el haber manual duplicado.

| Alumno | Haber manual actual | Propuesto | Reducción estimada |
|---|---:|---:|---:|
| Constanza Peñoñori | 71.240 | 2.764 | 68.476 |
| Daniel Mroz | 83.500 | 7.028 | 76.472 |
| Florencia Bunge | 65.500 | 0 | 65.500 |
| Gustavo Rosa | 71.240 | 0 | 71.240 |
| María Lorena Tempone | 83.500 | 0 | 83.500 |
| Martin Cortes | 0 actualmente | 0 | 0 |
| Mateo Melloni | 71.240 | 6.640 | 64.600 |
| Mercedes Carlés | 83.500 | 0 | 83.500 |
| Pablo Braier | 83.500 | 0 | 83.500 |
| Paula Edith Blasco | 65.500 | 0 | 65.500 |
| Pedro Ferroni | 83.500 | 0 | 83.500 |
| Sergio Celuch Eguren | 65.500 | 0 | 65.500 |
| Silvina Ambrosini | 71.240 | 0 | 71.240 |

- Reducción estimada en los 12 casos actualmente activos: **ARS 882.528**.
- Tope anterior de 13 casos: ARS 953.768; la diferencia es Martin Cortes, ARS 71.240.
- Son proyecciones de lectura, no saldos modificados ni resultados productivos verificados.

## Riesgos y límites antes de una aplicación segura
- No se ejecutó la vista corregida sobre datos productivos ni sobre el esquema completo restaurado; las pruebas usan fixtures fieles a las ramas financieras relevantes.
- Un segundo cobro manual que solo exista como marca en la misma suscripción, sin movimiento o comprobante separado, no puede distinguirse de una marca duplicada. Debe documentarse como ingreso independiente; no se infiere por importe.
- La migración aborta si la rama esperada de la vista cambió, evitando reemplazos sobre una definición incompatible.
- Antes de producción: aplicar en entorno seguro completo, correr estas regresiones y reconciliar los 12 casos antes/después por alumno y moneda. Publicar frontend es independiente y no forma parte de este cambio.
