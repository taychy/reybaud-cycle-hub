# 0112 — Plan de activación (NO activado)

## Estado
- SQL: `sql/pending/0112_event_mp_payment_sync.sql` (no aplicado en Lovable Cloud).
- Rollback: `sql/pending/0112_event_mp_payment_sync_rollback.sql` (autocontenido; restaura recálculo con md5 prosrc `7c332459f3c8fe091c5d70c390fcc85b`, idéntico al productivo).
- Webhook: llama a la RPC de 7 argumentos con `p_currency`; si no existe (PGRST202/42883) usa la ruta legacy.

## Dry run productivo (solo lectura, `tests/sql/event_payment_sync_dry_run.sql`, 2026-11-13)
- 71 reservas con cuotas; 30 tienen pagos validados con cuota (37 pagos).
- Candidato vs. base productiva: 0 cuotas / 0 reservas con reparto distinto (la marca explícita nace en false).
- Anulados validados que cambien totales: 0 reservas.
- Ya desfasadas hoy (cambiarían también con la base al recalcular): 2 cuotas en 2 reservas (`09946946…` cuota 4, `7b1fd1ad…` cuota 4). No son Federico, Nicolás ni Elías. La activación no las toca; sólo cambiarían en su próximo recálculo.
- Espejos `monto_pagado`/`saldo_pendiente` desalineados: 120 cuotas en 38 reservas; sólo se alinean cuando esa reserva se recalcula (sin barrido).

## Pasos
1. Repetir dry run inmediatamente antes; esperar 0 / 0 / 0 en las tres primeras métricas de cambio.
2. Aplicar el archivo 0112 byte a byte con la herramienta de migración (único paso que escribe estructura; sin filas).
3. Verificación de solo lectura: existe la RPC de 7 args con EXECUTE solo service_role; md5 del recálculo nuevo; columna con 0 filas en true.
4. Repetir dry run: mismas cifras.
5. Observar logs del webhook en el primer pago real (`event sync: action`), y `audit_log` `reserva.mp.pago.moneda_distinta`.
6. Si algo falla: aplicar rollback (vuelve al comportamiento actual exacto).

## Riesgos restantes
- Ruta legacy (mientras la RPC no exista) sigue con el error y registra en moneda de la reserva.
- `reassign_payment_to_installment` sigue sin mover dinero (los pagos reasignados no tienen marca): sin cambio respecto de hoy.
- Pagos MP en moneda distinta quedan sin registrar hasta conciliación manual por el flujo FX existente.
- `amount_mismatch` en informado→aprobado queda para revisión manual.
- Las 2 cuotas desfasadas y los espejos se corrigen solo al próximo recálculo de cada reserva.
- No hay índice único sobre `mp_payment_id`; la unicidad depende del bloqueo consultivo de la RPC.
