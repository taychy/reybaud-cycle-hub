
# Rediseño Interfaz de Facturación — Entrega A (visual + conteos)

Alcance acotado: solo cambios visuales/shell + conteos globales exactos. No se toca la lógica de emisión AFIP, ni los modales de facturación, ni las políticas de retención (queda para Entrega B con análisis previo tabla por tabla).

## Qué cambia (visible para el usuario)

1. **Stepper superior** reemplaza las 3 tabs de estado. Tres pasos horizontales con conteos exactos globales:
   - `● Cobrado NNN` → cobros sin factura creada
   - `● Sin CAE NNN` → facturas creadas sin emitir en AFIP
   - `● Emitido NNN` → facturas con CAE
   - Flechas entre pasos indican el flujo. Punto de color por estado (naranja/amarillo/verde).
   - A la derecha, dos accesos secundarios más chicos: `⚙ Emisores` y `Cuentas MP` (ya no como tabs).

2. **Barra de acciones unificada**:
   - Buscador global "Buscar cliente, servicio o producto…" a la izquierda.
   - Filtro dropdown "Todos los orígenes" a la derecha (app_online / manual_admin / efectivo / transferencia).

3. **Selección masiva siempre visible** (arriba de la lista):
   - Checkbox "Seleccionar todos (N)"
   - CTA primario "Facturar seleccionados" (usa el flujo bulk actual).

4. **Agrupación por antigüedad en la lista**, 3 buckets colapsables:
   - `⏱ Período actual` (últimos 7 días) — abierto por defecto
   - `8-30 días`
   - `⚠ Atrasados — más de 30 días sin facturar` (rojo)
   - Cada grupo muestra el conteo a la derecha y se expande/colapsa.

5. **Filas más limpias**: nombre grande, concepto + fecha en gris, monto grande, botón "Generar factura" secundario. Mantiene el checkbox de selección.

6. **Botones del header** (`SyncMpFeesButton`, `ManualInvoiceButton`) se mantienen tal cual.

## Qué NO cambia

- Modales `InvoiceModal` y `BulkInvoiceModal`: intactos.
- Componentes `PendingPaymentsList` y `BillingList`: **se mantienen los dos** como fuente de datos por paso del stepper (bajo riesgo, no fusiono lógica).
- Edge functions `auto-facturar`, `emit-factura-afip`, `generate-factura-pdf`: intactas.
- KPIs (`BillingKPIs`) y resumen de emisor (`BillingEmisorSummary`): se mantienen debajo del stepper.
- Tabs "Emisores" y "Cuentas MP": accesibles vía el menú secundario a la derecha del stepper, mismo contenido.
- Estados de facturas, RLS, triggers, cola: sin cambios.

## Conteos exactos globales

Actualmente `pendientes.length` y `historial.length` salen del array cargado con `limit(500)` en `AdminBilling.tsx`. Los reemplazo por 3 count queries paralelas:

- **Cobrado**: `count` sobre la lógica actual de `PendingPaymentsList` (revisar el componente para replicar el mismo filtro; probablemente cobros de `suscripciones`/`reservation_payments`/`store_orders` sin `factura_id`).
- **Sin CAE**: `select count(*, exact) from facturas where estado in ('sin_factura','error') or (estado='emitida' and cae is null)`, filtrando duplicados con la misma lógica de `refsConCAE` que ya usa el frontend.
- **Emitido**: `select count(*, exact) from facturas where estado='emitida' and cae is not null`.

Los conteos se recargan cuando cambia el tab, cuando se emite/factura algo (`onEmitted`), y con el `summaryKey` existente.

## Índices propuestos (a revisar antes de crear)

Antes de correr la migración, listo qué índices necesito y por qué. Los apruebas o los recortás:

1. `facturas (estado, cae) where estado in ('sin_factura','error','emitida')` — para acelerar los counts "Sin CAE" y "Emitido". Parcial para no inflar el índice.
2. `facturas (referencia_tipo, referencia_id) where estado='emitida' and cae is not null` — para la deduplicación por `refsConCAE`.
3. `facturas (created_at desc)` — para el orden y bucketing por antigüedad del listado.
4. **Para "Cobrado" (buckets por fecha_pago)**: depende de las tablas reales que usa `PendingPaymentsList`. En el plan actual solo levanto los índices sobre `facturas`. Para las tablas de cobros voy a leer primero `PendingPaymentsList.tsx` y en la migración incluyo únicamente los índices que efectivamente vayamos a usar en los counts (probables candidatos: `reservation_payments(estado, fecha_pago)`, `store_orders(status, created_at)`, `suscripciones(estado, fecha_pago)` — a confirmar cuando lea el archivo).

La migración crea los índices con `CREATE INDEX IF NOT EXISTS` (dentro de transacción de migración, sin `CONCURRENTLY`). Son idempotentes y reversibles con `DROP INDEX`.

## Riesgos

- **Bajo**: cambios de layout en `AdminBilling.tsx`, sin tocar la lógica de emisión.
- **Bajo**: nuevas count queries — si fallan, el stepper puede mostrar `—` sin romper la página.
- **Medio (mitigado)**: crear índices en producción sobre `facturas`. Mitigación: son índices pequeños, sin lock exclusivo prolongado; los reviso contigo antes de aplicar la migración.
- **Nulo**: se preservan todos los flujos actuales de emisión y bulk.

## Archivos a tocar

- `src/pages/admin/billing/AdminBilling.tsx` — reemplaza header + Tabs por stepper + shell nuevo.
- `src/pages/admin/billing/BillingStepper.tsx` *(nuevo)* — componente visual del stepper con 3 pasos + accesos secundarios.
- `src/pages/admin/billing/BillingToolbar.tsx` *(nuevo)* — buscador + filtro orígenes + selección masiva.
- `src/pages/admin/billing/BillingList.tsx` — agrupación por antigüedad con `Collapsible`, buscador y filtro conectados vía props.
- `src/pages/admin/billing/PendingPaymentsList.tsx` — misma agrupación y props (buscador/filtro).
- `src/pages/admin/billing/useBillingCounts.ts` *(nuevo)* — hook con las 3 count queries.

## Detalles técnicos

- Stepper: componente propio con tres botones role="tab", estado local `activeStep`, reemplaza el `Tabs value` actual. Los sub-tabs "Emisores" y "Cuentas MP" se manejan con un segundo estado `secondaryView` que puede ser `null | 'emisores' | 'cuentas_mp'` y renderiza `BillingEmisores` o `BillingCuentasMP` en lugar de la lista cuando está activo.
- Agrupación por antigüedad: función pura `bucketByAge(item)` que devuelve `'current' | 'mid' | 'overdue'` según `created_at`/`fecha_pago`. Filtro y búsqueda se aplican antes del bucketing.
- Buscador: `useDeferredValue` sobre el string, matchea `cliente_nombre`, `concepto`, `cliente_cuit`.
- Filtro orígenes: `origen_registro` en `PendingPaymentsList`, `metodo_pago` en `BillingList` (según qué columna esté disponible).
- Semantic tokens: nada de `text-white`/`bg-orange-500`. Uso `text-primary`, `text-destructive`, `bg-card`, `border-border`, etc.
- Mobile: el stepper colapsa a scroll horizontal en <768px; los buckets siguen colapsables.

## Orden de ejecución

1. Leer `PendingPaymentsList.tsx` para confirmar qué tablas alimentan "Cobrado" e incluir los índices correctos.
2. Presentarte la lista final de índices para aprobación.
3. Migración de índices (una sola, chica).
4. Implementar el hook `useBillingCounts`.
5. Crear `BillingStepper` y `BillingToolbar`.
6. Refactor de `AdminBilling.tsx`.
7. Agregar agrupación + búsqueda + filtro en `BillingList` y `PendingPaymentsList`.
8. Verificar en preview: 3 pasos con conteos, colapsables, búsqueda, bulk, apertura de modales, accesos a Emisores/Cuentas MP.

## Entrega B (después, no ahora)

Cuando aprobes esta entrega y la veas funcionando, abrimos plan aparte para la política de retención 190 días: te presento tabla por tabla los candidatos (`email_send_log`, `facturacion_cola`, `gastos_mp_webhook_log`, `admin_notification_events`, `reservation_notifications`, `whatsapp_check_runs`, etc.), columna de fecha, FKs, y recién ahí armamos el cron + email de aviso 15 días antes al superadmin. Nada de borrar datos hasta ese plan explícito.
