
# Calculadora de rentabilidad de eventos

Nueva funcionalidad interna (solo Super Admin) para simular costos, márgenes y precios sugeridos por modalidad de un evento/viaje, con historial de versiones, opción de aplicar precios a los paquetes reales y comparativa estimado vs real post-evento.

## Ubicación

- Nuevo **tab "Rentabilidad"** dentro de la ficha del evento (`/admin/eventos/:id`), visible solo para `super_admin`.
- Sin entradas nuevas en el sidebar.

## Estructura de datos

Tres tablas nuevas en Lovable Cloud:

1. `event_cost_simulations` — cabecera por versión
   - `event_id`, `version` (autoincremental por evento), `nombre`, `notas`
   - Supuestos: `tc_usd`, `tc_eur`, `pct_imprevistos`, `pct_margen_objetivo`, `moneda_base`
   - Datos evento: `noches`, `jornadas`, `capacidad_total`, `cantidades_esperadas` (jsonb por modalidad)
   - `resultados` (jsonb, snapshot calculado: totales, precios sugeridos, margen)
   - `estado`: `borrador | activa | archivada`
   - `aplicada_a_packages_at` (nullable)

2. `event_cost_items` — líneas de costo de la simulación
   - `simulation_id`, `categoria` (alojamiento / comida / transporte / staff / servicios / otros), `descripcion`
   - `cantidad`, `precio_unitario`, `moneda` (ARS/USD/EUR), `es_por_persona` (bool), `aplica_a_modalidades` (jsonb array)
   - `orden`

3. `event_cost_actuals` — ejecución real post-evento
   - `simulation_id` (la que quedó "activa"), `categoria`, `descripcion`, `monto_real`, `moneda`, `fuente` (`manual | gasto_id`), `gasto_id` nullable, `notas`
   - Participantes reales por modalidad: guardado en `event_cost_simulations.resultados_reales` (jsonb) o tabla auxiliar simple.

Todas con RLS restringida a `super_admin` (via `has_role`). GRANTs a `authenticated` + `service_role`. Sin acceso `anon`.

## Lógica de cálculo (frontend, pura)

Módulo `src/lib/eventCostCalculator.ts`:

- Normaliza cada ítem a `moneda_base` usando `tc_usd`/`tc_eur`.
- Suma costos fijos (no `es_por_persona`) y variables (multiplicando por participantes esperados según modalidades marcadas).
- Aplica `pct_imprevistos` sobre el total.
- Calcula **costo por participante por modalidad**.
- Sugiere **precio por modalidad** = `costo_modalidad / (1 - pct_margen_objetivo)`.
- Devuelve: `totales`, `costo_por_modalidad`, `precio_sugerido_por_modalidad`, `margen_estimado`, `punto_equilibrio`.

Se recalcula en vivo mientras editás; al guardar, el snapshot queda en `resultados`.

## UI — Tab "Rentabilidad"

Componente `EventCostSimulator.tsx` con:

1. **Header**: selector de versión (v1, v2, v3…), botones "Nueva versión", "Duplicar", "Archivar", badge de versión activa.
2. **Bloque supuestos**: TC USD/EUR, % imprevistos, % margen, moneda base.
3. **Bloque evento**: noches, jornadas, capacidad, cantidades esperadas por modalidad (auto-cargadas desde `event_packages` la primera vez).
4. **Bloque costos** (tabla editable): categoría, descripción, cantidad, precio, moneda, por persona sí/no, modalidades aplicables. Suma en vivo por categoría y por moneda.
5. **Bloque resultados**: costo total, costo por modalidad, **precio sugerido por modalidad**, margen estimado, punto de equilibrio.
6. **Acción "Aplicar precios a paquetes"** (opcional, con confirmación): actualiza `event_packages.precio` de las modalidades elegidas al precio sugerido. Registra `aplicada_a_packages_at` y una entrada en `audit_log`. Checkbox por modalidad para elegir cuáles aplicar.

## Estimado vs Real (post-evento)

Sub-tab "Real" dentro del mismo módulo:

- Tabla de costos reales con las mismas categorías (permite importar/vincular `gastos` existentes filtrados por evento).
- Input de participantes reales por modalidad (auto desde `event_participants` confirmados).
- Vista comparativa lado a lado: **Estimado vs Real** por categoría, con desvío absoluto y % — filas resaltadas cuando el desvío supera un umbral (ej. 15%).
- Margen real vs margen objetivo.

## Detalles técnicos

- Ruta: se agrega el tab en la página existente del evento (no route nueva).
- Guard: `useAdminAuth` + chequeo `has_role(_, 'super_admin')` antes de renderizar el tab.
- Migraciones en un solo call con CREATE TABLE + GRANT + RLS + POLICY + trigger `updated_at`.
- Sin dependencias nuevas; usa shadcn tables/dialogs existentes y `src/lib/currency.ts` para formateo.
- Historial: cada "Nueva versión" crea un row nuevo; "Duplicar" copia ítems.

## Fuera de alcance (para después)

- Exportar simulación a PDF.
- Vinculación automática 1:1 de cada gasto real al ítem estimado (por ahora es por categoría).
- Multi-usuario colaborativo en la misma simulación.

¿Avanzo con la implementación así?
