# Auditoría: pago MP 173687228510 (Federico Miño) no cancela la deuda de agosto

## Qué pasó exactamente

El pago existe y está bien registrado. El problema es que **quedó imputado a un período equivocado**.

Datos verificados en la base:

- `mp_account_movements`: pago `173687228510`, $71.240, `approved`, fecha 13/08/2026 20:22, `alumno_id` = Federico, `suscripcion_id` = `bf833ddf…`, `external_reference` = la misma suscripción. Auto-linkeado correctamente por el sync.
- Suscripción `bf833ddf…`: **creada el 13/08/2026 20:22**, pero con `fecha_inicio = 2026-07-01` y `fecha_fin = 2026-07-31`, precio 71.240, `mp_status = approved`, `notas = EARLY_RENEWAL_FROM:66f9c0c8…`.
- Suscripción de agosto `c4e59269…`: `fecha_inicio = 2026-08-01`, `estado = pendiente`, `origen_registro = renovacion_pendiente`, 71.240, **sin pago**.

Resultado en `vw_cuenta_corriente_movimientos`: el pago de $71.240 aparece como haber con fecha **01/07**, contra un cargo de julio recién creado; el cargo de agosto de $71.240 queda sin haber. Además julio queda duplicado: ya existía `cf08fe86…` (julio, $68.476, `mp_externo_claudio`, chequeado por admin) con su propio cargo y pago.

## Causa raíz exacta

Estado obsoleto (stale) del flujo de **renovación anticipada** guardado en `localStorage`.

- `src/lib/earlyRenewal.ts` → `setEarlyRenewal()` congela `fecha_inicio` / `fecha_fin` del "próximo período" en `localStorage` (claves `n`, `n_fecha_inicio`, `n_fecha_fin`, `n_sub_id`) en el momento en que el alumno toca "Renovar".
- Esas claves **no tienen vencimiento ni revalidación**: `getEarlyRenewal()` sólo comprueba que existan.
- Federico tocó "Renovar" cuando su sub vigente era `66f9c0c8…` (fin 30/06) → se guardó el período 01/07–31/07. No completó el pago en ese momento.
- El 13/08 volvió y pagó con tarjeta. `src/pages/PlanSelection.tsx` leyó el contexto viejo y usó `fechaInicio/fechaFin` de julio en el `INSERT`, además de escribir el marcador `EARLY_RENEWAL_FROM:66f9c0c8…`.
- El flag early-renewal también **desactiva la reutilización de sub pendiente** (`const reused = !n && …`), así que no se reutilizó la sub de agosto `c4e59269…` que ya existía.
- `trg_normalize_suscripcion_periodo` sólo trunca al mes de `fecha_inicio`: normaliza a 01/07–31/07, no corrige el mes equivocado.
- `process-card-payment` preserva las fechas ya cargadas en la sub (bloque "Preservar el período"), así que confirmó el período de julio.
- La vista y `is_subscription_paid()` funcionan bien: leen la evidencia MP de la sub `bf833ddf…`; el error es upstream, en qué obligación se creó.

No es un bug del webhook/sync de MP ni de la vista de cuenta corriente. Tampoco hay filas en `pagos_imputaciones` para este alumno (la imputación explícita no se usó en este caso).

## Archivos y funciones implicados

- `src/lib/earlyRenewal.ts` — `setEarlyRenewal`, `getEarlyRenewal`, `computeNextPeriodFromFechaFin` (sin TTL ni revalidación contra la sub vigente).
- `src/pages/PlanSelection.tsx` — usa `n.fechaInicio/n.fechaFin` tal cual y saltea `tryReuseExistingSubscription`.
- `src/components/checkout/ManualPaymentConfirm.tsx` — misma lógica para pagos manuales.
- `src/components/CardPaymentForm.tsx` — inserta la sub antes de cobrar; sólo usa `calendarMonthPeriod()` cuando NO hay early renewal.
- `supabase/functions/process-card-payment/index.ts` — preserva el período preexistente.
- DB: `normalize_suscripcion_periodo` (no valida mes pasado), `close_previous_subscription_on_new`, `is_subscription_paid`, `vw_cuenta_corriente_movimientos` (correctas).

## Riesgo para otros alumnos

Consultado sobre datos reales: **37 suscripciones creadas en un mes posterior al de su `fecha_inicio`**, de las cuales **13 llevan el marcador `EARLY_RENEWAL_FROM`** — es decir, el mismo patrón. Casos confirmados además de Federico: Gastón (creada 07/08 con inicio 01/06), Daniel (dos casos, 04 y 05/08 con inicio 01/07), Luciana, Mercedes, Walter Gustavo, Teresa Noemí, Rodrigo, Nicolás, Guillermo, María Gabriela.

Impacto típico: mes viejo duplicado/pagado dos veces en la cuenta corriente y mes corriente que sigue figurando como deuda, con el alumno apareciendo en Deudores pese a haber pagado.

## Remediación propuesta (no ejecutada)

1. **Prevención (código)**: dar TTL corto al contexto de renovación anticipada y revalidarlo antes de usarlo — si `fecha_inicio` guardada es anterior al mes en curso, o la sub origen ya no es la vigente, descartar el contexto y caer en `calendarMonthPeriod()` + reutilización de la sub pendiente.
2. **Red de seguridad (DB)**: extender `normalize_suscripcion_periodo` para no permitir crear una sub mensual nueva con período anterior al mes actual (salvo carga explícita de admin/backfill).
3. **Reparación de datos**: para cada caso, reimputar el pago al período correcto (o mover la sub al mes que corresponde) y cerrar el mes duplicado. Se haría uno por uno, empezando por Federico, con verificación previa/posterior de la cuenta corriente.
4. **Observabilidad**: vista de inconsistencia "sub creada con período pasado" para monitorear que no vuelva a ocurrir.
