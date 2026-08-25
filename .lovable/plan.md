# Auditoría READ-ONLY — Facturación

Sin cambios de código, migraciones, escrituras ni publicación. Todo lo que sigue está verificado con lectura de archivos y consultas SELECT.

## 1. Inventario de archivos (≈6.330 LOC)

UI `src/pages/admin/billing/**` — 3.872 LOC en 15 archivos. Los más grandes: `BillingCuentasMP.tsx` 754, `BillingEmisores.tsx` 720, `PendingPaymentsList.tsx` 477, `BulkInvoiceModal.tsx` 423, `BillingList.tsx` 413, `InvoiceModal.tsx` 258, `AdminBilling.tsx` 183, `ManualInvoiceButton.tsx` 137, `BillingStepper.tsx` 111, `BillingEmisorSummary.tsx` 103, `AgeGroupedList.tsx` 94, `BillingKPIs.tsx` 71, `useBillingCounts.ts` 62, `SyncMpFeesButton.tsx` 39, `ageBuckets.ts` 27.

Componentes fuera de la carpeta: `src/components/admin/BillingInvoiceLauncher.tsx` 240, `src/components/student/BillingDataSelfSection.tsx` 352.
Helpers: `src/lib/monotributo.ts` 26, `src/lib/mpFees.ts` 21.

Edge functions — 1.819 LOC: `emit-factura-afip` 563, `consultar-padron-afip` 375, `generate-factura-pdf` 355, `auto-facturar` 347, `send-factura-email` 179. Adyacentes: `backfill-mp-fees`, `_shared/resolve-cuenta-mp.ts`.

## 2. Consultas de carga e interacción

Carga inicial de `/admin/facturacion`: `facturas select("*") limit(500)` (AdminBilling.tsx:59) + `emisores_fiscales` sin límite + 5 counts `head:true` (useBillingCounts) + `emisores_fiscales`/`emisor_facturado_anual select("*")` (BillingEmisorSummary). El tab "Cobrado" agrega `facturacion_cola select("*") limit(2000)` + un segundo query `facturas.in(id,...)` (PendingPaymentsList:88-113). Tabs Emisores y Cuentas MP suman 3 y 4 queries sin límite (`emisor_facturado_anual select("*")`, `cuenta_mp_routing select("*")`).

Problemas concretos:
- Cargas completas con `select("*")`: facturas (500 filas, todas las columnas), facturacion_cola (2.000), cuenta_mp_routing, emisor_facturado_anual. Sin paginación real: el filtrado y agrupado por antigüedad se hace en cliente.
- N+1 real: `BillingInvoiceLauncher` hace un `facturas` query por fila renderizada (línea 55) — se monta por fila en `FacturasPorDiaPage`.
- N+1 real: en `PendingPaymentsList` la preparación masiva invoca `auto-facturar` por fila y luego un `facturas` lookup por fila (241 y 263).
- N llamadas secuenciales: `BulkInvoiceModal` emite en un `for` con `facturas.update` + `emit-factura-afip` por fila, sin concurrencia ni reintento (157-192).
- `BulkInvoiceModal` trae `alumnos` completo sin filtro ni límite para autocompletar por nombre (92-95); `InvoiceModal` hace matching difuso con `ilike ... limit(50)` (82-85).

## 3. Call-sites que crean facturas o emiten

Inserts en `facturas`: `ManualInvoiceButton.tsx:50` y `auto-facturar/index.ts:131`. No hay unique key que ate la factura a su origen.

`auto-facturar` se invoca desde 8 lugares: AdminEventReservations.tsx:1168, BillingInvoiceLauncher.tsx:100, RegisterPaymentModal.tsx:448, AdminPayments.tsx:415 y :573, ManageStudents.tsx:929, PendingPaymentsList.tsx:241 y server-to-server desde `admin-subscription-action/index.ts:135`.

`emit-factura-afip`: InvoiceModal.tsx:130 y BulkInvoiceModal.tsx:167. `generate-factura-pdf`: BillingList.tsx:123 y StudentPayments.tsx:501. `send-factura-email`: BillingList.tsx:136.

`facturacion_cola` no se escribe nunca desde código de app: la llena el trigger `enqueue_reservation_payment_facturacion` sobre `reservation_payments` (status validado) y la RPC manual `rebuild_facturacion_cola` (suscripciones + reservation_payments), llamada desde AdminDashboard.tsx:202 y PendingPaymentsList.tsx:137.

## 4. Duplicación de responsabilidades

Hoy hay **dos sistemas paralelos** que sólo se tocan por un trigger:
- `facturacion_cola` = cola de "lo cobrado que debería facturarse". Tiene unique `(referencia_tipo, referencia_id, pago_id)` y `ON CONFLICT DO NOTHING`: es idempotente. **Nadie la consume**: no existe worker ni cron que tome `pendiente` y dispare emisión.
- `facturas` = registro fiscal. Se crea por invocación manual de `auto-facturar` desde 8 puntos de la app, sin consultar la cola.
- Único puente: `tg_facturas_sync_cola` marca la fila de la cola como `facturada` cuando la factura llega a `emitida` + `cae`. Unidireccional y sólo en éxito: una factura en `error` deja la fila `pendiente` para siempre sin reintento.
- `source` de la cola admite `store_order`/`store_preorder` pero ningún trigger los alimenta: la tienda queda fuera de la cola aunque sí puede generar facturas por otros call-sites.
- Emisores: `emisores_fiscales` + `emisor_segmento_config` + vista `emisor_facturado_anual` deciden el emisor; `cuentas_mp` + `cuenta_mp_routing` deciden la cuenta de cobro. Son dominios distintos (fiscal vs. cobranza) montados en el mismo menú, lo que explica ~1.470 LOC de UI en dos pantallas que no participan del flujo de facturar.
- Pagos: la verdad de "cobrado" ya vive en Pagos/conciliación; la cola la vuelve a materializar sin ser la fuente de emisión → tercera versión de la misma verdad.

## 5. Errores semánticos, moneda, idempotencia, UX

Datos actuales: `facturas` sin_factura 259, emitida 200, error 18, anulada 4 (482 total, 282 sin CAE ≈ 58% placeholders). `facturacion_cola` pendiente 439, facturada 158, excluida 1.

- **Bug de estado**: `get_facturacion_metrics()` filtra `estado = 'facturado'`, pero el CHECK de la cola sólo permite `facturada`. Sus métricas `facturados` y `tasa_exito` son siempre 0 pese a 158 filas reales.
- **Idempotencia**: `facturas` no tiene unique por origen (sólo índice parcial no único `idx_facturas_ref_emitida`). `auto-facturar` inserta sin buscar existente → invocaciones repetidas (y hay 8 call-sites, varios en botones) pueden duplicar filas y hasta duplicar CAE.
- **Moneda**: `emit-factura-afip` manda `factura.monto` tal cual como Factura C (CbteTipo 11 = ARS) y no lee `moneda` en ningún punto. Hay 14 EUR + 3 USD en `facturas` y 13 EUR + 10 USD en la cola. Si alguna se auto-emite, se factura el número extranjero como pesos.
- **Cupo monotributo**: se controla sólo al elegir emisor (`emisor_facturado_anual`, suma 12 meses con CAE) y suma `monto` ignorando `moneda`. Sin cupo, la factura queda `sin_factura` y nunca se reintenta.
- **Reintentos**: no existen. `error` se resuelve a mano; el update posterior a la emisión (`emit-factura-afip:203-220`) sólo loguea si falla, lo que explica la fila `emitida` sin CAE.
- **UX**: el stepper mezcla tres verdades (cobrado / sin CAE / emitido) que provienen de tablas distintas y se deduplican en cliente (AdminBilling.tsx:100-113); 259 filas `sin_factura` son ruido permanente en la lista; los placeholders huérfanos se filtran en el front en vez de en la base; el matching de cliente por nombre con `ilike` puede facturar a la persona equivocada.

## 6. Arquitectura mínima propuesta (para aprobar antes de implementar)

Una sola cola fiscal, un solo worker, `facturas` como registro de resultado:

1. `facturacion_cola` es la única puerta de entrada. Todo cobro validado (suscripción, reserva, tienda, preventa) entra por trigger; se elimina el rebuild manual como camino principal (queda como reconciliador).
2. Un worker (edge function + cron) toma `pendiente`, resuelve emisor/cupo/moneda y emite. Con backoff: `intentos`, `proximo_intento_at`, `ultimo_error`, y estado `error_retryable` vs `error_fatal`.
3. Idempotencia dura: unique en `facturas (referencia_tipo, referencia_id)` para no anuladas + upsert en `auto-facturar`; los 8 call-sites pasan a sólo encolar (o a una única RPC `solicitar_factura`), nunca a insertar.
4. Moneda: bloquear emisión AFIP si `moneda <> 'ARS'` sin `monto_ars` + `tipo_cambio` explícitos; el cupo del emisor se calcula sobre `monto_ars`.
5. UI reducida a dos vistas: "Cola" (pendiente / error con reintento) e "Historial" (emitidas), con paginación y conteos server-side; los placeholders `sin_factura` dejan de existir como filas de `facturas`.
6. Emisores y Cuentas MP se mueven a Configuración fiscal (fuera del flujo diario); `BillingInvoiceLauncher` pasa a recibir el estado por props del listado en vez de consultar por fila.
7. Corregir `get_facturacion_metrics()` (`facturado` → `facturada`).

Orden sugerido si se avanza: (7) y unique de idempotencia → guardas de moneda → worker con reintentos → simplificación de UI.
