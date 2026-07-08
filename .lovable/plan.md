# Rentabilidad por evento — Plan

Objetivo: saber cuánto queda **neto real** por cada evento (y por suscripciones/tienda), descontando comisiones MP, gastos directos, honorarios y prorrateos.

## 1. Capturar comisiones MP en cada pago

Hoy guardamos el total cobrado, no el neto. MP devuelve el desglose en `fee_details` de cada payment.

**Cambios de esquema** (una sola migración):
- `reservation_payments`: `+ comision_mp numeric, + iibb numeric, + otros_fees numeric, + neto_recibido numeric, + fees_synced_at timestamptz`
- `suscripciones`: mismas 5 columnas
- `store_orders`: mismas 5 columnas
- Vista `v_ingresos_netos` que unifica las 3 fuentes con `origen, referencia_id, event_id, bruto, comision, neto, fecha`.

**Captura automática** (nuevos pagos):
- En `process-card-payment` y en el webhook de MP para reservas/tienda, después de aprobar, hacer `GET /v1/payments/{id}` y volcar `fee_details` a las columnas.
- Función utilitaria `_shared/parse-mp-fees.ts` para no duplicar lógica.

**Backfill acotado** (últimos 3 meses):
- Edge function `backfill-mp-fees` (batch, paginada, con throttle 5 req/s).
- Recorre las 3 tablas donde `mp_payment_id is not null AND created_at >= now() - 90 days AND fees_synced_at is null`.
- Botón "Sincronizar comisiones MP" en `/admin/facturacion` con progreso.

## 2. Vincular gastos a eventos

**Esquema:**
- `gastos`: `+ event_id uuid references events(id) on delete set null` (nullable, indexado)
- `gastos_recurrentes`: idem
- `gastos_ejecuciones`: hereda `event_id` del recurrente al ejecutarse.

**UI carga (dos caminos, mismos datos):**
- **Módulo Gastos existente** (`SuperAdminGastos`): agregar selector "Evento asociado (opcional)" con buscador de eventos.
- **Tab nuevo "Finanzas" dentro del evento** (`EventManagement`): lista los gastos del evento + botón "Registrar gasto" que abre el mismo formulario preseteando `event_id`.

## 3. Panel de rentabilidad por evento

Dentro del tab "Finanzas" del evento, un card **P&L** con:

```text
Ingresos brutos            $ ---
− Comisión MP + IIBB       $ ---
= Ingresos netos           $ ---
− Gastos directos          $ ---
− Honorarios coaches       $ ---   (desde movimientos_liquidacion.evento_id)
− Prorrateo generales      $ ---   (opcional, ver abajo)
─────────────────────────
= Resultado del evento     $ ---
```

**Fuentes:**
- Ingresos: `v_ingresos_netos` filtrada por `event_id` (join a `reservation_payments → event_reservations`).
- Gastos directos: `gastos.event_id = X`.
- Honorarios: `movimientos_liquidacion` que ya tienen relación al evento.
- Prorrateo: gastos generales del período del evento, distribuidos por peso (participantes o ingresos brutos). Configurable con toggle "Incluir prorrateo".

**Vista global** en `/admin/eventos` (columna nueva "Resultado") + orden por rentabilidad.

## 4. Fuera de alcance de esta iteración
- Multi-moneda para gastos por evento (usamos el mismo estándar `currency.ts`).
- Presupuesto vs. real (queda para una segunda etapa).
- Exportación PDF del P&L (después).

## Detalles técnicos

**Migraciones** (2 archivos):
1. Columnas MP fees en `reservation_payments`, `suscripciones`, `store_orders` + vista `v_ingresos_netos` + índices por `event_id`.
2. Columna `event_id` en `gastos`, `gastos_recurrentes`, `gastos_ejecuciones` + trigger que propaga de recurrente a ejecución + GRANT y policies existentes se mantienen.

**Edge functions:**
- `backfill-mp-fees` (nueva, admin-only, batch de 50).
- Modificar `process-card-payment`, `mp-webhook` (reservas), `mp-store-webhook` para llamar a `parse-mp-fees` y persistir.

**Frontend:**
- `src/lib/mpFees.ts` — helpers de cálculo/formato.
- `EventFinanceTab.tsx` — nuevo tab en `EventManagement`.
- `GastoForm` — agregar selector de evento.
- `SuperAdminGastos` — filtro "por evento".
- Card "Sincronizar comisiones MP" en `/admin/facturacion`.

**Orden de ejecución:**
1. Migración 1 (fees) + captura automática en las 3 edge functions.
2. Backfill edge function + botón en facturación → correr una vez.
3. Migración 2 (event_id en gastos) + selector en form de gasto.
4. Tab "Finanzas" del evento con P&L.
5. Columna "Resultado" en listado de eventos.

¿Arranco por el paso 1 o preferís que revisemos algo antes?
