
# Modificación de reserva (cambio de paquete) — v2

Rediseño del plan aplicando el feedback: separar simular de aplicar, clasificar el riesgo, tratar plaza libre como impacto (no bloqueo), separar pagos reales de créditos, y revalidar todo dentro de la transacción final.

## Principios de diseño

1. **La reserva original es histórica**. Nunca se pisa: los pagos, cuotas emitidas, habitación y precio pagado se conservan. Un cambio genera ajustes nuevos, nunca reescrituras silenciosas.
2. **Simular antes de aplicar**. Dos RPCs distintas: `preview_package_change` (read-only, calcula impacto) y `apply_package_change` (transacción). La UI muestra exactamente lo que devuelve el preview.
3. **Tres resultados posibles**, nunca "ok / bloqueado":
   - `AUTO_APPLICABLE` — alumno confirma y se aplica.
   - `REQUIERE_APROBACION` — genera solicitud pendiente para admin.
   - `NO_POSIBLE` — bloqueado con razón concreta (sin cupo, evento iniciado, proponer roommate no inscripto, etc.).
4. **Revalidación transaccional**. `apply_package_change` recalcula cupo, precio, habitación y estado de reserva dentro de la misma transacción; si algo cambió respecto al preview, aborta con error legible.
5. **Plaza libre = impacto económico**, no prohibición. La organización puede asumir el costo con override registrado.

## 1. Configuración por evento (admin)

Nuevos campos en `events`:

- `permite_cambio_paquete_alumno` (bool, default true)
- `dias_limite_cambio_alumno` (int, default 60) — dentro de esta ventana, alumno solo puede *solicitar*.
- `permitir_downgrade` (bool, default true)
- `politica_precio_cambio` (enum: `vigente` | `conserva_etapa` | `diferencia_protegida`, default `vigente`)
- `credito_valido_solo_en_evento` (bool, default true)
- `bloquear_cambios_despues_de_inicio` (bool, default true)

UI: sección "Reglas de cambio de paquete" en la config del evento con estos controles y ayuda inline.

## 2. Clasificación de cambios (motor de riesgo)

Antes de decidir qué permitir, el preview clasifica el cambio:

| Tipo | Ejemplo | Default |
|---|---|---|
| Comercial simple | Agrega traslado, no toca habitación ni cupos críticos | AUTO |
| Económico | Doble → single sin afectar compañero | REQUIERE_APROBACION si genera crédito |
| Logístico | Doble → sin hotel | REQUIERE_APROBACION |
| Habitacional | Sale de doble compartida | REQUIERE_APROBACION |
| Estructural | Cambia cabaña/triple con impacto en varios ocupantes | REQUIERE_APROBACION |
| Excepción tardía | Dentro de `dias_limite_cambio_alumno` | REQUIERE_APROBACION siempre |

La clasificación se calcula en el preview y se muestra al alumno con lenguaje claro ("Este cambio afecta la organización de alojamiento y requiere revisión").

## 3. Habitaciones: impacto, no bloqueo

Helper `evaluate_room_impact(reservation_id, package_nuevo_id, roommate_propuesto_id?)` retorna:

```json
{
  "status": "auto_applicable | requiere_aprobacion | no_posible",
  "habitacion_origen": { "tipo": "doble", "companero": "Paula", "quedaria_vacia": true },
  "habitacion_destino": { "tipo": "single", "cupo_disponible": true },
  "roommate_propuesto_valido": null,
  "impacto_economico_estimado": 45000,
  "razones": ["Quedaría una plaza vacía en la habitación de Paula"]
}
```

Reglas:
- Plaza libre en compartida → `requiere_aprobacion` con `impacto_economico_estimado`.
- Paquete destino sin cupo real → `no_posible`.
- Roommate propuesto no inscripto o ya en habitación completa → `no_posible`.
- Roommate propuesto rompe otra habitación → `requiere_aprobacion`.
- Admin siempre puede aprobar con checkbox "Asumir el costo de plaza libre" (registrado en `nota_admin`).

## 4. Separar pagos reales de ajustes financieros

Nueva tabla `reservation_financial_adjustments`:

- `reservation_id`, `alumno_id`, `event_id`
- `tipo`: `credito_por_downgrade | debito_por_upgrade | descuento_admin | reembolso_emitido | credito_aplicado_addon | credito_aplicado_cuota`
- `monto_original`, `monto_disponible`, `moneda`
- `estado`: `activo | consumido | vencido | reembolsado`
- `origen_cambio_id` (FK a `event_package_change_requests`)
- `motivo`, `vence_el`, `created_at`, `created_by`

Los `reservation_payments` siguen siendo solo dinero real que entró. Los créditos, débitos y descuentos van a esta tabla nueva. Permite responder claramente: cuánto entró, cuánto está a favor, cuánto se devolvió, cuánto se consumió en addons.

Vista `v_reservation_account` que consolida ambos para mostrar saldo real al alumno y al admin.

## 5. Solicitud de cambio (workflow)

Tabla `event_package_change_requests`:

- `id`, `reservation_id`, `alumno_id`, `event_id`
- `package_actual_id`, `package_nuevo_id`
- `estado`: `pendiente | aprobada | rechazada | aplicada | expirada`
- `preview_snapshot` (jsonb) — resultado completo del preview al momento de solicitar
- `motivo_alumno`, `nota_admin`
- `roommate_propuesto_id`
- `override_plaza_libre` (bool)
- `resolved_at`, `resolved_by`, `applied_at`
- `expires_at` (default 7 días o inicio del evento, lo que ocurra antes)

RLS: alumno ve las suyas; admin ve todas.

Flujo:
1. Alumno abre "Ver opciones de cambio" → elige paquete → llama `preview_package_change`.
2. UI muestra simulación completa con clasificación y botón contextual:
   - `AUTO_APPLICABLE` → **Confirmar cambio** → dispara `apply_package_change` directamente.
   - `REQUIERE_APROBACION` → **Solicitar cambio** → crea request + email admin + alerta.
   - `NO_POSIBLE` → botón deshabilitado con razón concreta.
3. Admin ve la solicitud en `/admin/eventos/:id/cambios-paquete` con el `preview_snapshot` + preview re-calculado en vivo (para detectar drift).
4. Admin aprueba → `apply_package_change` con `request_id`.
5. Alumno recibe email con nuevo detalle + crédito/débito generado.

## 6. RPC `preview_package_change` (read-only)

Inputs: `reservation_id`, `package_nuevo_id`, `roommate_propuesto_id?`, `politica_precio_override?`.

Retorna:

```json
{
  "status": "auto_applicable | requiere_aprobacion | no_posible",
  "clasificacion": "comercial_simple | economico | ...",
  "package_actual": { "id", "nombre", "precio_pagado_reserva" },
  "package_nuevo": { "id", "nombre", "precio_aplicable", "etapa_vigente" },
  "politica_precio_aplicada": "vigente",
  "amount_paid": 700000,
  "difference": -200000,
  "credit_to_create": 200000,
  "debit_to_create": 0,
  "installments_preview": [ ... ],
  "addons_to_remove": [ ... ],
  "room_impact": { ... },
  "warnings": [ "Se generará un crédito dentro del evento" ],
  "blockers": [],
  "revalidation_token": "hash-de-estado-actual"
}
```

`revalidation_token` = hash de (cupos del paquete, precio vigente, estado habitación, versión reserva). Se envía a `apply_package_change` y si no coincide → aborta.

## 7. RPC `apply_package_change` (transaccional)

Inputs: `reservation_id`, `package_nuevo_id`, `revalidation_token`, `request_id?`, `override_plaza_libre?`, `admin_user_id?`.

En una sola transacción:
1. `SELECT ... FOR UPDATE` sobre reserva, paquete destino, habitaciones afectadas.
2. Recomputar preview y comparar `revalidation_token`. Si difiere → `RAISE EXCEPTION` con detalle.
3. Verificar reglas duras: evento no iniciado (si aplica), estado modificable, no hay otra request pendiente.
4. Snapshot en `reservation_status_history`.
5. Update `event_reservations`: `package_id`, `package_nombre_snapshot`, `price_snapshot` (según `politica_precio_cambio`).
6. Marcar addons incompatibles como removidos (motivo: cambio de paquete).
7. Recalcular `amount_total`, `balance_due`. Generar `reservation_financial_adjustments` según delta (crédito o débito).
8. Regenerar cuotas pendientes (respetar las pagadas).
9. Ajustar `reservation_roommates` según resultado del room impact.
10. Marcar `request_id` como `aplicada`.
11. Log en `student_activity_log` + `audit_log`.
12. Encolar emails: alumno con nuevo detalle, admin si hubo override o crédito a devolver.

## 8. UI alumno

Botón "Ver opciones de cambio" en `ReservationStatusCard` → drawer:
- Selector de paquete disponible (con cupo real y precio vigente).
- Selector opcional de compañero (si el destino lo requiere).
- Al elegir → llama `preview_package_change` (con debounce) → muestra la simulación humanizada:

```
Tu paquete actual: Doble — $1.400.000
Nuevo paquete: Single — $1.850.000

Ya abonaste: $900.000
Nuevo saldo pendiente: $950.000

Alojamiento:
Este cambio libera una plaza en tu habitación actual.
Requiere revisión del equipo organizador.

[Solicitar cambio]
```

- Botón contextual según status (`Confirmar cambio` / `Solicitar cambio` / deshabilitado).
- Textarea de motivo (obligatorio si requiere aprobación).

## 9. UI admin

- Pestaña "Cambios de paquete" en detalle del evento con requests pendientes/históricas.
- Cada request muestra `preview_snapshot` guardado + preview live re-calculado (con badge si difieren).
- Acciones: Aprobar, Rechazar, "Aprobar con override" (para plaza libre).
- Dentro de `AdminEventReservations`, acción per-participante "Cambiar paquete" con el mismo flujo (sin bloqueo, con override registrado).
- Dashboard admin: contador de requests pendientes + créditos por devolver.

## 10. Reglas duras (siempre bloquean)

- Evento ya iniciado y `bloquear_cambios_despues_de_inicio = true` → solo ajuste manual DB.
- Cambio al mismo paquete → NO_POSIBLE con mensaje.
- Reserva con más de una request pendiente → NO_POSIBLE hasta resolver.
- Reserva en estado no modificable (cancelada, expirada).

## 11. Casos de prueba obligatorios

Se documentan en `.lovable/tests/package-change-cases.md` y se cubren con QA manual antes de release:

1. Upgrade con cupo.
2. Downgrade genera crédito.
3. Pagado 100% y baja de paquete.
4. Sube de paquete sin pagos.
5. Sale de doble y deja plaza libre → REQUIERE_APROBACION.
6. Entra a doble con compañero ya asignado (habitación abierta).
7. Propone compañero no inscripto → NO_POSIBLE.
8. Dos alumnos tomando último cupo simultáneamente → uno gana, otro recibe drift error.
9. Admin aprueba fuera de plazo.
10. Admin fuerza plaza vacía con override.
11. Addon incompatible se remueve y queda como crédito.
12. Reserva con dos requests pendientes → segunda bloqueada.
13. Mismo paquete → NO_POSIBLE.
14. Paquete se agota entre preview y confirm → drift error, no aplica.
15. Cuota vencida al momento de cambiar → warning, no bloqueo.
16. Evento iniciado → bloqueado.

## 12. Plan de rollout

Para minimizar riesgo:

**Fase 1** — Solo admin: `preview_package_change`, `apply_package_change`, UI admin, tabla de requests. Alumno no ve nada.

**Fase 2** — Alumno lee-only: alumno ve el drawer con simulación pero solo puede "Solicitar cambio" (nunca aplicar solo).

**Fase 3** — Auto-aplicable habilitado: se activan los casos `AUTO_APPLICABLE` para alumno. Requiere haber probado en 2-3 eventos reales.

## Detalles técnicos

**Migraciones**:
- `ALTER TABLE events` con los 6 campos de configuración.
- `CREATE TABLE event_package_change_requests` + GRANT + RLS.
- `CREATE TABLE reservation_financial_adjustments` + GRANT + RLS.
- `CREATE VIEW v_reservation_account`.
- Funciones: `preview_package_change`, `apply_package_change`, `evaluate_room_impact`, `classify_package_change`. Todas SECURITY DEFINER con search_path fijo.

**Edge functions**:
- `notify-package-change-request`
- `notify-package-change-resolved`

**Frontend nuevo**:
- `src/components/reservation/ChangePackageDrawer.tsx` (alumno)
- `src/components/admin/AdminChangePackageDialog.tsx`
- `src/components/admin/PackageChangePreview.tsx` (visual reutilizable del preview)
- `src/components/admin/RoomImpactReport.tsx`
- `src/pages/admin/AdminPackageChangeRequests.tsx`
- `src/lib/packageChangePreview.ts` (cliente del RPC + tipos)

**Fuera de alcance**:
- Swap de compañeros sin cambio de paquete.
- Auto-matching de roommates.
- Devolución automática al medio de pago original (queda como acción manual admin).
- Créditos cross-evento (política default: solo dentro del evento).

---

Confirmame el plan y arranco por Fase 1: migración + `preview_package_change` + UI admin de solicitudes.
