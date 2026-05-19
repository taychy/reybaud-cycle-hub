## Resumen visual

```text
┌────────────── /admin/facturacion ──────────────┐
│ KPIs                                            │
├─────────────────────────────────────────────────┤
│ NUEVO  · Resumen por emisor                     │
│ ┌─────────────┬─────────────┬─────────────┐    │
│ │ Reybaud Cic │ Otro Emisor │ ...         │    │
│ │ Facturado   │ Facturado   │             │    │
│ │ $42.3M      │ $5.1M       │             │    │
│ │ ████░░ 61%  │ █░░░░░  8%  │             │    │
│ │ últ. 12 m   │ últ. 12 m   │             │    │
│ └─────────────┴─────────────┴─────────────┘    │
├─────────────────────────────────────────────────┤
│ Tabs: Pendientes · Historial · Todos · Emisores │
│                                                 │
│ Pendientes (con multi-selección)                │
│ ☐ Filtros: ☑ sin_factura ☑ error ☑ manual       │
│ ┌─────────────────────────────────────────┐    │
│ │ ☐ TODOS                                  │    │
│ │ ☐ Juan Pérez  · sub · $48.000  [sin fac] │    │
│ │ ☐ M. López    · sub · $48.000  [error]   │    │
│ │ ☑ S. Gómez    · sub · $12.000  [manual]  │    │
│ └─────────────────────────────────────────┘    │
│       Seleccionadas: 1 · Total $12.000          │
│       [ Facturar masivamente ▾ ]                │
└─────────────────────────────────────────────────┘
```

## Cambios

### 1. Base de datos (migración)

- Agregar `categoria_monotributo` (text) a `emisores_fiscales`. Valores tipo `A`/`B`/`...`/`H`/`RI` opcional. UI lo usa para autocompletar `limite_anual_ars` (override manual sigue mandando).
- Reemplazar la vista `emisor_facturado_anual` para que sume **solo facturas con CAE** (autorizadas por AFIP) de los **últimos 12 meses móviles** en lugar de año calendario. Mantiene mismas columnas (`facturado_anual`, `porcentaje_uso`, `cupo_disponible`).

### 2. Resumen por emisor (nuevo componente)

`BillingEmisorSummary.tsx` montado en `AdminBilling.tsx` debajo de los KPIs. Una card horizontal por emisor activo:
- Nombre + CUIT.
- Facturado últimos 12 meses (verde si <75%, naranja 75-90%, rojo ≥90%).
- Barra de progreso vs `limite_anual_ars`.
- Disponible restante.
- Si no tiene límite configurado: aviso "Configurar tope".

### 3. Lista con multi-selección y filtros configurables

En `BillingList.tsx`:
- Cabecera con 3 checkboxes para filtrar qué estados aparecen como "facturables": `sin_factura`, `error`, `manual sin CAE`. Por defecto los tres activos.
- Checkbox por fila + checkbox "seleccionar todas las visibles facturables".
- Barra fija inferior con conteo seleccionado, total a facturar, selector de emisor y botón **"Previsualizar y facturar"**.

### 4. Modal de previsualización y facturación masiva

`BulkInvoiceModal.tsx`:
- Tabla editable: cliente, CUIT/DNI (input para completar faltantes), condición fiscal (selector), concepto, monto.
- Validación visual: filas sin DNI quedan resaltadas y se pueden deseleccionar individualmente.
- Resumen: cantidad, monto total, emisor elegido y cupo restante de ese emisor (avisa si la operación supera el cupo disponible).
- Botón "Emitir N facturas" → loop secuencial llamando a la edge function `emit-factura-afip` ya existente. Muestra progreso ("emitiendo 3/12"), errores por fila al final, y refresca al cerrar.

### 5. UI de categorías en `BillingEmisores`

En el dialog de editar emisor:
- Selector "Categoría monotributo" con presets oficiales (A–H) que precarga el tope; campo "Tope anual (ARS)" sigue editable como override.

## Detalles técnicos

- Vista nueva:
  ```sql
  CREATE OR REPLACE VIEW emisor_facturado_anual AS
  SELECT e.id AS emisor_id, e.nombre_fiscal, e.cuit, e.limite_anual_ars,
    COALESCE(SUM(CASE WHEN f.cae IS NOT NULL AND f.fecha_emision >= now() - interval '12 months'
                      THEN f.monto ELSE 0 END), 0) AS facturado_anual,
    CASE WHEN e.limite_anual_ars IS NULL OR e.limite_anual_ars = 0 THEN NULL
         ELSE round(SUM(CASE WHEN f.cae IS NOT NULL AND f.fecha_emision >= now() - interval '12 months'
                             THEN f.monto ELSE 0 END) / e.limite_anual_ars * 100, 2) END AS porcentaje_uso,
    CASE WHEN e.limite_anual_ars IS NULL OR e.limite_anual_ars = 0 THEN NULL
         ELSE GREATEST(e.limite_anual_ars - SUM(...), 0) END AS cupo_disponible
  FROM emisores_fiscales e LEFT JOIN facturas f ON f.emisor_id = e.id
  GROUP BY e.id;
  ```
- Presets monotributo en `src/lib/monotributo.ts` (constante actualizable, no hace falta tabla).
- Bulk emit: frontend itera con `await` para no saturar AFIP; resultado agregado en toast + lista de errores.
- No tocamos la edge function de emisión (la single ya está estable).

## No incluye
- Selector "12 meses móviles + año calendario" (solo 12m móviles, según respuesta).
- Endpoint backend masivo dedicado (se reusa el unitario).
