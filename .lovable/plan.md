# Auditoría: conciliación de cobros recurrentes de Mercado Pago

Solo lectura. No se modificó código, datos ni base. Todo lo afirmado abajo fue verificado en el código actual o con consultas SELECT a la base de producción.

## 1. Hallazgo principal (causa raíz confirmada)

**Ninguna suscripción del sistema tiene guardado el identificador de suscripción recurrente de Mercado Pago.**

Verificado: `select count(*) , count(mp_preapproval_id) from suscripciones` → **992 filas, 0 con `mp_preapproval_id`**.

Consecuencia directa: el webhook que procesa los cobros automáticos (`supabase/functions/mp-webhook/index.ts`, bloque "AUTHORIZED PAYMENT FLOW", líneas 113-200) busca la suscripción "madre" con `.eq("mp_preapproval_id", preapprovalId)` y, al no encontrarla, registra `No parent subscription for preapproval` y responde `{ ok: true, no_parent: true }`. **Sale sin imputar nada y sin dejar alerta.** Los cobros recurrentes en curso fueron creados fuera de la app (panel de Mercado Pago), por lo que nunca existió ese vínculo.

El único lugar que escribe `mp_preapproval_id` al crear es `create-mp-preapproval/index.ts` (línea 170), es decir, sólo suscripciones nacidas dentro de la app — que hoy son cero.

## 2. Flujo actual de un cobro recurrente (trazado)

```text
MP cobra (día 1)
  ├─ webhook authorized_payment → mp-webhook → busca suscripciones.mp_preapproval_id
  │                                            → 0 coincidencias → SALE SIN HACER NADA
  └─ cron sync-mp-account-movements (cada 15 min, ventana últimos N días)
        → inserta fila en mp_account_movements con raw completo del pago
        → auto-link: 1) reservation_payments por mp_payment_id
                     2) suscripciones por mp_payment_id
                     3) alumnos por payer.email (ilike, exacto)
        → NO mira metadata.preapproval_id, ni point_of_interaction.transaction_data.subscription_id,
          ni plan_id, ni description
        → queda alumno_id seteado pero suscripcion_id NULL
En paralelo:
  renew-monthly-subscriptions (cron diario 00:05 ART) crea la renovación del mes
  en estado 'pendiente' → el alumno figura impago aunque MP ya cobró.
```

Archivos/objetos que intervienen: `mp-webhook`, `sync-mp-account-movements`, `sync-mp-preapproval`, `create-mp-preapproval`, `process-auto-renewals`, `renew-monthly-subscriptions`, `cleanup-pending-subscriptions`; tablas `mp_account_movements`, `suscripciones`, `alumnos`, `cuentas_mp`; RPCs `assign_mp_movement_to_target`, `assign_mp_movement_to_alumno`, `assign_mp_movement_to_new_suscripcion`.

**Dónde exactamente se pierde el dato:** el `raw` sí guarda todo (verificado), pero ni el sync ni ningún proceso posterior lee `preapproval_id` / `subscription_id` / `plan_id` / `description`. La imputación queda 100% manual desde el conciliador.

## 3. Condición de carrera / diseño

`renew-monthly-subscriptions` decide sólo mirando `suscripciones` (fecha_fin vencida + pagada). No consulta cobros de MP ya acreditados. Por eso convive una renovación `pendiente` con un cobro aprobado del mismo período. Además `cleanup-pending-subscriptions` cancela pendientes de MP sin pago pasadas 48 h, lo que puede borrar la obligación antes de que se concilie.

## 4. Datos reales verificados

Cobros recurrentes aprobados, ingreso, **sin imputar**, desde 2026-07-01, con descripción `PL `, `Ruta x 2` o `Pase Libre`:

- **31 pagos** en total; **22 con alumno identificado** (los que reportaste) y **9 sin alumno**.
- 13 emails distintos, **13 preapproval/subscription ids distintos**, y **los 31 traen `plan_id` de MP en el raw**.
- Los 6 emails sin alumno (`carlos@sonicotrip.com`, `fshelby427@gmail.com`, `hb@personalbrokers.com.ar`, `kevin.snypher@gmail.com`, `liftek@hotmail.com`, `silvinaambrosini@hotmail.com`) **no existen como `alumnos.email`** — 0 coincidencias. Algunos sí quedaron vinculados en meses posteriores, lo que indica alta secundaria o email adicional; el sync sólo mira `alumnos.email`, no `emails_adicionales`.
- `mp_preapproval_id` en suscripciones: **0 de 992**.
- Los importes coinciden exactamente con `precio_final` de las suscripciones del período (68.476 / 71.240 / 80.030 / 83.500).
- Caso Tamara Mazur: preapproval `f23846c8…`, plan MP `3a4f61d7…`, pagos 1/7 (68.476), 1/8 (71.240). Sus suscripciones "Grupal 2x por semana" de julio (`8d43b18d…`, vencida) y agosto (`8be18161…`, vencida) tienen el mismo importe y ningún `mp_payment_id`. Julio además tiene **dos** suscripciones (Grupal 2x y Pase Libre `500ae895…`, pendiente, 75.500) → hay ambigüedad de plan en ese mes, resuelta por importe.

### Clasificación de confianza propuesta

| Nivel | Criterio | Volumen estimado |
|---|---|---|
| Alta | preapproval conocido + alumno único + una sola suscripción del período + importe exacto | mayoría de los 22 (uno por alumno/mes) |
| Media | alumno resuelto pero el período tiene más de una suscripción candidata (ej. Tamara julio) o el importe difiere del precio de lista | pocos casos |
| Baja | los 9 sin alumno (email no existe en fichas), y cualquier alumno con ficha duplicada | 9 |

La tabla completa fila por fila (mp_payment_id, fecha, alumno, payer_email, descripción, importe, preapproval, plan MP, suscripción candidata, plan, estado, acción sugerida) se genera con la consulta de la sección técnica; no se incluye acá para no volcar datos personales innecesarios.

## 5. ¿Existe mapping persistente MP ↔ alumno ↔ plan?

**No.** No hay tabla de preapprovals, ni columna de plan de MP en `planes`, ni catálogo de descripciones. `suscripciones.mp_preapproval_id` existe pero está vacío.

### Modelo mínimo propuesto (no implementado)

```text
mp_preapprovals
  preapproval_id (PK, texto)       -- id de la suscripción en MP
  mp_plan_id (texto, nullable)     -- plan_id de MP
  cuenta_mp_id
  alumno_id (nullable)             -- confirmado por admin
  plan_id (nullable)               -- plan Reybaud
  descripcion_mp, importe_referencia, moneda
  estado: detectado | confirmado | ignorado
  confirmado_por, confirmado_at, notas
```

Se alimenta automáticamente desde el `raw` de cada cobro (fila nueva en estado `detectado`) y un admin confirma alumno+plan una sola vez. A partir de ahí todos los cobros futuros de ese preapproval se imputan solos. Opcional: `planes.mp_plan_id` para mapear plan MP → plan Reybaud.

## 6. Motor de conciliación objetivo (diseño)

Función `conciliar_cobro_recurrente(movimiento)` con cascada estricta, de mayor a menor evidencia:

1. `mp_payment_id` ya imputado → no hacer nada (idempotencia).
2. preapproval confirmado en `mp_preapprovals` → alumno + plan conocidos → buscar suscripción del período (mes de `fecha_movimiento` en ART) con ese plan → imputar. Si no existe, crear la mensualidad del período con el importe cobrado, marcada como generada por conciliación.
3. Preapproval no confirmado pero email resuelve a un único alumno con una única suscripción del período e importe exacto → **propuesta**, no imputación automática.
4. Cualquier ambigüedad (varios alumnos, varias suscripciones, importe distinto) → cola de revisión manual.

Reglas invariantes: nunca imputar el mismo `mp_payment_id` a dos obligaciones (ya lo garantizan las guardas de `assign_mp_movement_to_target`), toda acción con registro en `audit_log`, y todo automatismo debe poder revertirse dejando rastro. `renew-monthly-subscriptions` debería consultar el mapping antes de crear una renovación pendiente para un preapproval activo, y `cleanup-pending-subscriptions` no debería cancelar períodos con cobro MP aprobado sin imputar.

## 7. Backfill de los casos históricos (diseño, sin ejecutar)

- Paso 1: RPC `preview_conciliacion_recurrente()` → devuelve las 31 filas con nivel de confianza y acción sugerida. Solo lectura.
- Paso 2: `aplicar_conciliacion_recurrente(ids[], modo)` sólo sobre los ids que el admin seleccione, y sólo nivel alto en la primera tanda.
- Paso 3: cada imputación guarda `assign_notes` con origen `backfill_recurrente_<fecha>` para permitir reversión selectiva.
- Reversión: RPC que desvincula `suscripcion_id`/`mp_payment_id` y restituye el estado previo del período, registrando en `audit_log`. No se borran filas.
- Los 9 sin alumno quedan fuera del backfill hasta resolver identidad (posible fusión de fichas o email adicional).

## 8. Plan vigente vs deuda histórica

Hoy un mes viejo impago deja al alumno como deudor en el panel operativo. Propuesta conceptual: el estado operativo se calcula únicamente sobre el período corriente, y los períodos cerrados impagos se agrupan aparte como "deuda histórica", con su propio indicador. No requiere cambiar estados existentes, sólo separar la lectura.

## 9. Fases

- **P0 — parar la hemorragia (bajo riesgo):** crear `mp_preapprovals`, poblarla en modo lectura desde los `raw` existentes, y hacer que `sync-mp-account-movements` persista preapproval/subscription/plan de MP en columnas dedicadas. Ninguna imputación automática todavía. Criterio de aceptación: los 31 casos aparecen con su preapproval identificado y el sistema no cambia ningún estado.
- **P1 — conciliación asistida:** pantalla de confirmación de preapprovals + preview de backfill + aplicación explícita de los casos de alta confianza. Criterio: los 22 casos con alumno quedan imputados o explícitamente descartados, sin duplicados.
- **P2 — automatización:** el webhook y el sync imputan solos los preapprovals confirmados; `renew-monthly-subscriptions` deja de generar pendientes para suscripciones con cobro recurrente activo. Criterio: un mes completo sin cobros recurrentes sin imputar.

Riesgos principales: doble imputación (mitigado por guardas ya existentes), atribución equivocada por email compartido o ficha duplicada (mitigado exigiendo confirmación humana del preapproval una vez), y cancelación de períodos por el limpiador antes de conciliar (mitigado en P0 con una exclusión).

## 10. Supuestos y límites

- Asumo que los cobros recurrentes fueron creados desde el panel de Mercado Pago y no desde la app; es la explicación consistente con 0 de 992 suscripciones con preapproval. No lo pude verificar contra la API de MP en modo lectura.
- El mapeo plan MP → plan Reybaud lo infiero por descripción e importe; no existe hoy ningún vínculo declarado.
- El conteo de "22" corresponde a los cobros con alumno ya identificado; el universo real de cobros recurrentes sin imputar desde julio es de 31.
- No verifiqué el contenido de `emails_adicionales` para los 6 emails huérfanos.
