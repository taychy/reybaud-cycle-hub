# Auditoría (solo lectura) — Finanzas, Filtros de Alumnos, Iniciación vs Formación

Nada fue modificado: sin código, sin migraciones, sin deploy. Datos al 03/09/2026.

---

## 1) FINANZAS — por qué hoy los números no son claros

El Resumen actual (`src/pages/admin/AdminDashboard.tsx`) muestra 4 tarjetas que mezclan criterios distintos:
"Críticas" (alertas heterogéneas acumuladas), "Cobros pendientes" (SOLO `source='cuota_evento'` de `vw_pagos_por_cobrar`, sin horizonte temporal), "Facturas por emitir" (sólo las de hoy) y "Pagos por conciliar" (sólo hoy). Nunca se muestra el mes, ni Cobrado, ni Egresos, ni resultado.

### A. Ingresos reales (caja) — fuente canónica: `mp_account_movements`
- Septiembre 2026, `status='approved'`, `direccion='ingreso'`: **59 movimientos, ARS 5.122.260**.
- Unidad de negocio: se deriva de `cuentas_mp` + `cuenta_mp_routing` (escuela / eventos / turnera / tienda) y del vínculo del movimiento (`suscripcion_id`, `reservation_payment_id`, `alumno_id`).
- Corte de septiembre ya auditado: Escuela ARS 1.941.940 · Eventos ARS 691.475 · Turnera ARS 247.500 · Tienda ARS 0 · **Sin identificar ARS 987.073** (19 movimientos sin vínculo).
- Pagos manuales validados: `reservation_payments` y `suscripciones` con estado verificado; se suman SOLO si no tienen `mp_payment_id` (si lo tienen ya están en MP).
- NO sumar: `facturas`, `cuenta_ajustes`, `pagos_imputaciones`, `store_orders.total`, `facturacion_cola`.
- Riesgo real: `cuenta_mp_routing` puede producir fan-out (un movimiento contado dos veces) si se hace join sin deduplicar por `mp_account_movements.id`.

### B. Total a cobrar del mes — fuente canónica: `vw_pagos_por_cobrar`
Columnas reales: `source, item_id, alumno_id, concepto, amount, currency, due_date, effective_status`.

| source | n | total | vencido (arrastre) | vence en septiembre |
|---|---|---|---|---|
| suscripcion (ARS) | 282 | 19.249.025 | 13.498.914 (203) | 5.750.111 |
| cuota_evento (ARS) | 61 | 11.604.871 | 6.056.755 (32) | 5.548.116 |
| suscripcion (USD) | 3 | 225 | 225 | — |

La tarjeta actual muestra sólo la fila `cuota_evento` completa (11,6 M) sin separar vencido vs. del mes: por eso "Cobros pendientes" no coincide con ninguna lectura intuitiva. Tienda y Turnera **no** tienen devengado confiable (no hay cuotas ni obligaciones; sólo pedidos/reservas con pago inmediato) — no deben incluirse en "Por cobrar".

### C. Egresos reales
- `mp_account_movements` con `direccion='egreso'` (clasificado por trigger `classify_mp_movement_direccion`, ver `supabase/migrations/20260728142101_*.sql`): septiembre **9 movimientos, ARS 831.759**.
- `gastos` (tabla canónica de egresos): septiembre **5 registros, ARS 777.610**, los 5 con `mp_payment_id`.
- **No hay doble conteo estructural**: el vínculo existe en ambas direcciones (`gastos.mp_payment_id` y `mp_account_movements.gasto_id`), creado por `mp-gastos-webhook` vía `create_gasto_from_mp` / `apply_mp_payment_to_gasto` (idempotente por `mp_payment_id`).
- **Sí hay huecos**: en septiembre 4 movimientos de egreso MP (ARS 54.148) todavía sin `gasto_id`. Regla correcta: Egresos = `gastos` + movimientos MP `direccion='egreso'` **sin** `gasto_id` (nunca la suma cruda de ambas tablas).
- Liquidaciones de coaches (`liquidaciones_mensuales`): **0 filas**. Proveedores tienda (`supplier_orders`): 2 cerradas, sin importes de pago. Costos de eventos (`event_cost_actuals`): sin registro relevante. Es decir: el egreso real está subrepresentado.

### D. Por pagar / comprometido — fuente canónica: `gastos_ejecuciones` (+ `gastos_recurrentes`)
- pendiente 127 · ARS 30.616.624 | vencido 35 · ARS 673.860 | parcial 1 · ARS 34.445 | pagado 145 · ARS 52.152.988 | omitido 47.
- Liquidaciones pendientes de coaches: **no hay dato** (tabla vacía).
- Proveedores/tienda y eventos: **no hay dato de compromiso** (no existe monto a pagar modelado).

### E. Monedas
- `gastos`: 100 % ARS (126 registros). `vw_pagos_por_cobrar`: ARS y USD (3 obligaciones USD 225). `mp_account_movements.currency` = ARS.
- Recomendación: KPI siempre por moneda, sin conversión. USD/EUR como línea aparte, nunca sumada.

### F. Conciliación
Modelo actual por movimiento MP: `direccion` (trigger), vínculos `suscripcion_id` / `reservation_payment_id` / `alumno_id` / `gasto_id`, `assigned_manually` (protege la asignación manual en la resync). El helper `src/lib/mpConciliacion.ts` define el estado en frontend: sin identificar / identificado sin imputar / imputado. Sin clasificar hoy: ARS 987.073 de ingresos y 4 egresos MP sin gasto.

### G. Facturación no es ingreso
`facturas` / `facturacion_cola` reflejan obligación fiscal, no cobro: backlog 501 comprobantes por ARS 40.372.615 vs. ARS 5,1 M cobrados en septiembre. Emitir puede ocurrir mucho después (o nunca) del cobro y una factura puede agrupar varios pagos. Sirve como KPI de cumplimiento fiscal, jamás como ingreso.

### H. Métricas propuestas y su fuente exacta

| Métrica | Fuente canónica | NO sumar |
|---|---|---|
| Cobrado (caja, mes) | `mp_account_movements` approved + ingreso; + pagos manuales sin `mp_payment_id` | facturas, ajustes, imputaciones, store_orders.total |
| Por cobrar (mes) | `vw_pagos_por_cobrar` separando "vence en el mes" / "vencido arrastrado" | tienda, turnera, precios de lista |
| Pagado (caja, mes) | `gastos` + MP egreso sin `gasto_id` | suma cruda gastos + MP |
| Por pagar | `gastos_ejecuciones` (pendiente/vencido/parcial) | `gastos` ya pagados |
| Resultado de caja | Cobrado − Pagado (mismo mes, misma moneda) | mezcla con devengado |
| Proyección | Cobrado + Por cobrar del mes − Pagado − Por pagar del mes | etiquetar siempre "proyección" |

### Categorización de gastos — diagnóstico y diseño (no implementar)
- Hoy la categoría es **texto libre** en `gastos.categoria` (+ `subcategoria`), y en `gastos_recurrentes.categoria`. No hay tabla de categorías ni enum. La UI (`SuperAdminGastos.tsx`) tiene un orden hardcodeado `["Sueldos","Impuestos","Sueldos variables","Servicios","Vehiculo"]` y los selects se arman con `Array.from(new Set(...))` de lo ya cargado, más un default `"Otros"`.
- Consecuencia visible: 16 categorías con variantes semánticas ("Sueldos Variables" vs. el orden hardcodeado en minúscula), más categorías-basura de origen automático: `MP - Egresos` (5) y `Por conciliar` que crea `create_gasto_from_mp`.
- Descripciones reales de egresos MP para probar reglas: `Peajes / transporte`, `Transferencia MP (web)`, `$ 195648.66 de DIESEL VP | SHOP`, `JUMBO SAN MARTIN 5205002`, `ENAUSA SA`, `Pago: saldo_vencido Cuenta: 3237153267`, `Varios`, y muchos `null`.

Cambio mínimo propuesto (diseño):
1. Tabla `gasto_categorias` (`id, nombre, activa, orden, archivada_at`) + `gastos.categoria_id` nullable, backfill por nombre, manteniendo `categoria` texto como histórico congelado. Eliminar sólo si no tiene gastos; si tiene, **archivar/inactivar** (no borra historia, deja de ofrecerse).
2. Tabla `gasto_reglas_categoria` (`patron`, `campo`: descripción / contraparte / cuenta MP, `categoria_id`, `prioridad`, `activa`). Al crear un egreso desde MP se aplica la primera regla que matchea; si ninguna matchea, cae en "Por conciliar".
3. Flag `categoria_manual boolean` en `gastos` (o reusar `categorizado_at`/`categorizado_por` que ya existen en `mp_account_movements`): si Admin editó la categoría, ninguna re-ejecución de reglas la sobreescribe.
4. Sin jerarquía padre/hijo: alcanza categoría + `subcategoria` libre + reglas. No sobre-modelar.

---

## 2) Filtros de Admin > Alumnos

Chips actuales (`ManageStudents.tsx` líneas 1111-1134): Todos, Nuevos (30d), Pendientes, Activos, Vacaciones, Inactivos, Bloqueados, Vencidos, Pago pendiente, Acceso pausado, Sin grupo, ⚠ Incons., Incompletos, Duplicados, Conflicto modalidad, Con acceso, Sin acceso, **un chip por cada plan histórico** (`plan_<id>`, incluye planes inactivos), Sin plan, Sin plan activo. Son ~25-30 chips en una sola fila envolvente, debajo del bloque "Distribución de activos" que ya muestra grupo operativo y plan activo.

Recomendación:
- **Chips primarios (5):** Todos · Activos · Pendientes · Vencidos · Nuevos (30d).
- **Menú "Estado":** Vacaciones, Inactivos, Bloqueados, Pago pendiente, Acceso pausado.
- **Menú "Acceso":** Con acceso, Sin acceso.
- **Menú "Plan":** Sin plan, Sin plan activo, y los planes; dentro, dos grupos: "Planes activos" y "Históricos" (colapsado). El plan ACTIVO ya se filtra desde la distribución (`active_plan_<id>`), así que este menú queda para el criterio histórico.
- **Menú "Calidad de datos":** Incompletos, Duplicados, ⚠ Inconsistentes, Conflicto modalidad, Sin grupo. Mostrar un punto de alerta en el disparador cuando alguno tenga count > 0.
- Cada menú muestra en su etiqueta el filtro elegido y su count, para no perder la lectura numérica que hoy dan los chips.

---

## 3) Programa Iniciación vs Grupo de Formación

| Plan | ID | Categoría | Activo | Creado | Subs totales | Activas |
|---|---|---|---|---|---|---|
| Grupo de formacion ciclista-Nivel inicial | `cfc43af9-…56eed` | `grupal` | **No** | 2026-04-02 | 22 | 0 |
| Programa Iniciación 2026/2 | `c1e21518-…c9854` | `formacion` | Sí | 2026-07-15 | 15 | 9 |

- El plan legacy tiene 18 suscripciones canceladas (14/03 → 30/06/2026) y 4 finalizadas (abril-mayo). **Ninguna vigente.**
- Son **el mismo producto en generaciones distintas** (curso de iniciación / formación inicial), pero con categoría distinta: el legacy quedó como `grupal`, el nuevo como `formacion`. Esa diferencia de categoría es la que rompe la clasificación operativa: sólo `formacion` cuenta como "Aspirantes".
- **Por qué aparecen ambos chips:** `planCounts` (línea 431) se arma recorriendo TODAS las suscripciones de los alumnos listados, sin filtrar por plan activo ni por suscripción vigente. Cualquier alumno activo con una suscripción histórica al plan viejo genera el chip. Hay 9 alumnos activos con suscripciones históricas a ese plan (M. J. Izurieta y Sea, M. A. Landro, D. Sokyransky, A. M. Chaves, A. Teselman, S. Barros, A. Martinero, S. Parodi…); el chip muestra 3 porque cuenta según el criterio de suscripción del listado, no distintos alumnos-con-plan.
- **Ningún alumno activo debería estar hoy en el plan legacy:** todas sus suscripciones están canceladas o finalizadas y sus alumnos ya están en pelotones (G1-G4). Es puramente histórico.
- **Recomendación de unificación (sin borrar historia ni mezclar cohortes):**
  1. Agregar al plan legacy un marcador de familia/producto (por ejemplo `plan_familia = 'iniciacion'` en ambos planes) para agrupar visualmente sin fusionar filas.
  2. En los chips, mostrar los planes inactivos bajo el submenú "Históricos" del menú Plan, con la etiqueta de la cohorte (`Iniciación · 2026/1 (histórico)` y `Iniciación · 2026/2`).
  3. No migrar suscripciones ni cambiar `plan_id`: la cohorte se preserva por plan.
  4. Opcional y seguro: normalizar la categoría del legacy a `formacion` — no altera cálculos actuales porque no tiene suscripciones vigentes, y deja consistente cualquier informe histórico por categoría.

---

## Conclusión
- Finanzas: las fuentes existen y son suficientes para Cobrado / Por cobrar / Pagado / Por pagar, pero hoy el Resumen expone un recorte parcial (sólo cuotas de eventos y sólo el día) y falta cerrar 3 huecos reales: ARS 987 K de ingresos MP sin identificar, 4 egresos MP sin gasto vinculado, y ausencia total de liquidaciones/costos de eventos/proveedores.
- Alumnos: la reducción a 5 chips primarios + 4 menús es directa y no pierde ningún filtro.
- Iniciación: mismo producto, dos generaciones; el ruido viene del cálculo de `planCounts` sobre suscripciones históricas, no de un dato incorrecto.

Ninguna de estas propuestas fue implementada. Decime cuál abordamos primero y armo el plan de implementación.
